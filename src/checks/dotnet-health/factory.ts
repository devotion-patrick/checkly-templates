import { ApiCheck } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { resolveHeaders } from '@checkly-templates/shared/headers';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { KIND_VERSION, type DotnetHealthEntry } from './schema.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_5M',
};

const DEFAULT_HEALTHY_VALUES = ['Healthy'];
const DEFAULT_DEGRADED_VALUES = ['Degraded'];
const DEFAULT_STATUS_PATH = '$.status';
const DEFAULT_COMPONENTS_PATH = "$.results['{name}'].status";

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return b + p;
}

// Runs after the request completes, with the real response body in hand.
// Declarative AssertionBuilder equality checks can't express "degraded is
// a warning, unhealthy is a failure" — a single .equals() only gives a
// strict pass/fail, so ASP.NET Core's own default of mapping Degraded to
// HTTP 200 (same as Healthy) made it invisible to a status-code check,
// and a strict body-equality check couldn't tell a caller "this is
// degraded, not down" — it just failed the same way either failure would.
// This script owns all of that severity logic in one place instead, and
// reads its parameters from an env var so the script text itself never
// changes per entry (see DOTNET_HEALTH_PARAMS below).
const TEARDOWN_SCRIPT = `
const params = JSON.parse(process.env.DOTNET_HEALTH_PARAMS);
const body = JSON.parse(response.body);

function getPath(obj, path) {
  const parts = path.replace(/^\\$\\.?/, '').match(/[^.\\[\\]']+/g) || [];
  return parts.reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

const findings = [];
const warnings = [];

function classify(label, value) {
  if (params.healthyValues.includes(value)) return;
  if (!params.failOnDegraded && params.degradedValues.includes(value)) {
    warnings.push(label + ' is "' + value + '" (degraded, non-blocking).');
    return;
  }
  findings.push(
    label + ' reported "' + value + '" (expected healthy: ' + params.healthyValues.join(', ') +
      (params.failOnDegraded ? '' : '; or degraded: ' + params.degradedValues.join(', ')) + ').',
  );
}

classify('Overall status', getPath(body, params.statusPath));
for (const name of params.expectedComponents) {
  classify('Component "' + name + '"', getPath(body, params.componentsPath.replace('{name}', name)));
}

console.log('dotnet-health: ' + findings.length + ' finding(s), ' + warnings.length + ' warning(s).');
for (const w of warnings) console.log('  warning: ' + w);
for (const f of findings) console.log('  finding: ' + f);

if (findings.length > 0) {
  throw new Error(findings.join(' | '));
}
`;

export function factory(entry: DotnetHealthEntry, ctx: ProjectContext): ApiCheck {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? "EVERY_15M";
  const locations = resolveLocations(entry, ctx);
  // healthyValues supersedes expectedOverallStatus; the latter is kept
  // as a fallback so existing configs (one string) keep working.
  const healthyValues =
    entry.healthyValues ?? (entry.expectedOverallStatus ? [entry.expectedOverallStatus] : DEFAULT_HEALTHY_VALUES);
  const degradedValues = entry.degradedValues ?? DEFAULT_DEGRADED_VALUES;
  // `healthPath` only contributes when explicitly set. If the consumer
  // put the full health endpoint in `url`, leaving healthPath unset is
  // correct and we hit `url` as-is.
  const targetUrl = entry.healthPath ? joinUrl(entry.url, entry.healthPath) : entry.url;

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry, templateVersion: KIND_VERSION }),
    ctx.project.tags,
    entry.tags,
  );

  // No declarative assertions: relying on `statusCode().equals(200)` can't
  // see degraded at all (ASP.NET Core's default maps Degraded to the same
  // 200 as Healthy), and a strict body-equality assertion can't tell a
  // degraded response from a truly unhealthy one — both just "don't
  // equal". The teardown script owns all of that severity logic instead,
  // against the real response body, and produces a message that says
  // which value it actually saw. A network-level failure (timeout, DNS,
  // connection refused) still fails the check on its own, independent of
  // this script.
  const healthParams = {
    statusPath: entry.statusPath ?? DEFAULT_STATUS_PATH,
    componentsPath: entry.componentsPath ?? DEFAULT_COMPONENTS_PATH,
    expectedComponents: entry.expectedComponents ?? [],
    healthyValues,
    degradedValues,
    failOnDegraded: entry.failOnDegraded ?? false,
  };

  const { headers, environmentVariables: headerEnvVars } = resolveHeaders(entry.logicalId, entry.headers, [
    { key: 'Accept', value: 'application/json' },
  ]);
  const environmentVariables: Array<{ key: string; value: string }> = [
    { key: 'DOTNET_HEALTH_PARAMS', value: JSON.stringify(healthParams) },
    ...headerEnvVars,
  ];

  return new ApiCheck(entry.logicalId, {
    // Pass `targetUrl` as the url so the auto-composed name reflects the
    // actual endpoint hit (entry.url + healthPath) rather than the bare
    // base. Per-entry `name` overrides still win unchanged.
    name: buildCheckName(ctx.project, { ...entry, url: targetUrl }),
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    tags,
    environmentVariables,
    request: {
      method: 'GET',
      url: targetUrl,
      headers,
      followRedirects: false,
    },
    tearDownScript: { content: TEARDOWN_SCRIPT },
  });
}
