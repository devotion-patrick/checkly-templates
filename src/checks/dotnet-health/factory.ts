import { ApiCheck, AssertionBuilder } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { type DotnetHealthEntry } from './schema.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_5M',
};

const DEFAULT_OVERALL_STATUS = 'Healthy';

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return b + p;
}

export function factory(entry: DotnetHealthEntry, ctx: ProjectContext): ApiCheck {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? "EVERY_15M";
  const locations = resolveLocations(entry, ctx);
  const overall = entry.expectedOverallStatus ?? DEFAULT_OVERALL_STATUS;
  // `healthPath` only contributes when explicitly set. If the consumer
  // put the full health endpoint in `url`, leaving healthPath unset is
  // correct and we hit `url` as-is.
  const targetUrl = entry.healthPath ? joinUrl(entry.url, entry.healthPath) : entry.url;

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry }),
    ctx.project.tags,
    entry.tags,
  );

  const assertions = [
    AssertionBuilder.statusCode().equals(200),
    AssertionBuilder.jsonBody('$.status').equals(overall),
    ...(entry.expectedComponents ?? []).map((name) =>
      AssertionBuilder.jsonBody(`$.results['${name}'].status`).equals(overall),
    ),
  ];

  // Headers: default Accept first, then consumer items. For each item
  // that uses `valueFromEnv`, read process.env at deploy time and stash
  // as a per-check Checkly env var so the secret stays scoped to this
  // construct (not account-global). The header value gets rewritten to
  // `{{ENV_NAME}}` so Checkly resolves it server-side at run time.
  const headers: Array<{ key: string; value: string }> = [
    { key: 'Accept', value: 'application/json' },
  ];
  const environmentVariables: Array<{ key: string; value: string }> = [];
  for (const h of entry.headers ?? []) {
    if (h.valueFromEnv) {
      const v = process.env[h.valueFromEnv];
      if (v === undefined || v === '') {
        throw new Error(
          `Check "${entry.logicalId}" header "${h.key}" sources its value from env var ` +
            `"${h.valueFromEnv}", but that variable is not set in the deploy environment. ` +
            `Add it to your CI's secret store (ADO variable group, GHA secret, etc.) so it's ` +
            `available to the pipeline step running \`checkly deploy\`.`,
        );
      }
      environmentVariables.push({ key: h.valueFromEnv, value: v });
      headers.push({ key: h.key, value: `{{${h.valueFromEnv}}}` });
    } else if (h.value !== undefined) {
      headers.push({ key: h.key, value: h.value });
    }
    // Schema-side `oneOf` guarantees exactly one of value / valueFromEnv;
    // no third branch needed.
  }

  return new ApiCheck(entry.logicalId, {
    // Pass `targetUrl` as the url so the auto-composed name reflects the
    // actual endpoint hit (entry.url + healthPath) rather than the bare
    // base. Per-entry `name` overrides still win unchanged.
    name: buildCheckName(ctx.project, { ...entry, url: targetUrl }),
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    tags,
    environmentVariables: environmentVariables.length > 0 ? environmentVariables : undefined,
    request: {
      method: 'GET',
      url: targetUrl,
      headers,
      followRedirects: false,
      assertions,
    },
  });
}
