import { RetryStrategyBuilder, UrlAssertionBuilder, UrlMonitor } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { KIND_VERSION, type UptimeSslEntry } from './schema.ts';

export const defaults: KindDefaults = {
  // Free to run this often: a UrlMonitor is billed by monitor count, not
  // by run, unlike every other kind in this repository.
  frequency: 'EVERY_1M',
};

const DEFAULT_THRESHOLD_DAYS = 30;
const DEFAULT_SUCCESS_RANGE = { min: 200, max: 299 } as const;

export function factory(entry: UptimeSslEntry, ctx: ProjectContext): UrlMonitor {
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

  return new UrlMonitor(entry.logicalId, {
    name: buildCheckName(ctx.project, entry),
    frequency: parseFrequency(frequencyName),
    // Checkly types `locations` as a strict `keyof Region` union; we
    // accept any string at the consumer boundary and trust the Checkly
    // CLI to reject unknown region IDs at deploy time.
    locations: locations as never[],
    activated: entry.activated ?? true,
    retryStrategy: RetryStrategyBuilder.noRetries(),
    tags,
    request: {
      url: entry.url,
      // Off, deliberately: a redirect used to be resolved silently and
      // judged only on the destination's status. A URL monitor has no
      // script to inspect the response itself, so this is what makes a
      // redirect visible at all -- it lands outside successStatusRange
      // and the status-code assertion below fails on it directly.
      followRedirects: false,
      // A range expressed as two exclusive bounds: UrlAssertionBuilder's
      // statusCode() exposes greaterThan/lessThan (strict), the same as
      // ApiCheck's AssertionBuilder.
      assertions: [
        UrlAssertionBuilder.statusCode().greaterThan(successRange.min - 1),
        UrlAssertionBuilder.statusCode().lessThan(successRange.max + 1),
      ],
    },
  });
}
