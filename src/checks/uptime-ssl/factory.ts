import { ApiCheck, AssertionBuilder } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { KIND_VERSION, type UptimeSslEntry } from './schema.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_5M',
};

const DEFAULT_THRESHOLD_DAYS = 30;
const DEFAULT_SUCCESS_RANGE = { min: 200, max: 299 } as const;

export function factory(entry: UptimeSslEntry, ctx: ProjectContext): ApiCheck {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? "EVERY_15M";
  const locations = resolveLocations(entry, ctx);
  const successRange = entry.successStatusRange ?? DEFAULT_SUCCESS_RANGE;
  // SSL expiry alerting in Checkly v7 is configured at the alert-channel
  // level (`sslExpiry: true`, `sslExpiryThreshold: <days>`), not on the
  // check itself. The kind preserves the field for forward compatibility
  // (so consumer configs don't need to change when we wire it through to
  // an alert channel), but for v0.1.0 the value is informational only.
  void entry.sslCertificateExpiryThresholdDays;
  void DEFAULT_THRESHOLD_DAYS;

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry, templateVersion: KIND_VERSION }),
    ctx.project.tags,
    entry.tags,
  );

  return new ApiCheck(entry.logicalId, {
    name: buildCheckName(ctx.project, entry),
    frequency: parseFrequency(frequencyName),
    // Checkly types `locations` as a strict `keyof Region` union; we
    // accept any string at the consumer boundary and trust the Checkly
    // CLI to reject unknown region IDs at deploy time.
    locations: locations as never[],
    activated: entry.activated ?? true,
    tags,
    request: {
      method: 'GET',
      url: entry.url,
      followRedirects: true,
      // Checkly's AssertionBuilder.statusCode() exposes lessThan / greaterThan
      // (strict). For an inclusive range we widen by one on each side.
      assertions: [
        AssertionBuilder.statusCode().greaterThan(successRange.min - 1),
        AssertionBuilder.statusCode().lessThan(successRange.max + 1),
      ],
    },
  });
}
