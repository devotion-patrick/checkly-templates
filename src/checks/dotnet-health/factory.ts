import { MultiStepCheck, RetryStrategyBuilder } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import type { HeaderSpec } from '@checkly-templates/shared/headers';
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

interface ScriptHeader { key: string; value?: string; envVar?: string }

/**
 * Like `@checkly-templates/shared/headers`'s `resolveHeaders`, but for a
 * script that reads `process.env` directly rather than a declarative
 * `request.headers` field. That helper's `{{ENV_NAME}}` template string is
 * only meaningful where Checkly itself interpolates a field server-side;
 * a MultiStepCheck script already has the real env var in scope, so this
 * keeps the env var's *name* instead, and the script resolves it locally.
 */
function resolveHeadersForScript(
  logicalId: string,
  headers: HeaderSpec[] | undefined,
): { headerParams: ScriptHeader[]; environmentVariables: Array<{ key: string; value: string }> } {
  const headerParams: ScriptHeader[] = [];
  const environmentVariables: Array<{ key: string; value: string }> = [];

  for (const h of headers ?? []) {
    if (h.valueFromEnv) {
      const v = process.env[h.valueFromEnv];
      if (v === undefined || v === '') {
        throw new Error(
          `Check "${logicalId}" header "${h.key}" sources its value from env var ` +
            `"${h.valueFromEnv}", but that variable is not set in the deploy environment. ` +
            `Add it to your CI's secret store (ADO variable group, GHA secret, etc.) so it's ` +
            `available to the pipeline step running \`checkly deploy\`.`,
        );
      }
      environmentVariables.push({ key: h.valueFromEnv, value: v });
      headerParams.push({ key: h.key, envVar: h.valueFromEnv });
    } else if (h.value !== undefined) {
      headerParams.push({ key: h.key, value: h.value });
    }
    // Schema-side `oneOf` guarantees exactly one of value / valueFromEnv;
    // no third branch needed.
  }

  return { headerParams, environmentVariables };
}

// A MultiStepCheck, not an ApiCheck: declarative AssertionBuilder equality
// checks can't express "degraded is a warning, unhealthy is a failure" --
// a single .equals() only gives a strict pass/fail, so ASP.NET Core's own
// default of mapping Degraded to HTTP 200 (same as Healthy) made it
// invisible to a status-code check, and a strict body-equality check
// couldn't tell a caller "this is degraded, not down" -- it just failed
// the same way either failure would. This script owns all of that
// severity logic instead, against the real response body, and produces a
// message that says which value it actually saw.
//
// A degraded-only outcome now leaves a `degraded.json` marker (the shape
// the official @checkly/playwright-helpers package's markCheckAsDegraded()
// writes) instead of only a console warning, so it reaches Checkly's own
// status as Degraded rather than silently passing as Up. That marker
// needs a scriptable, Playwright-based runtime -- confirmed against a
// live account (2026-09-14) that a hand-written file, with no dependency
// on that package, is honoured identically -- which an ApiCheck's
// teardown sandbox does not have (no `fs` module at all).
const SCRIPT = `
const { test } = require('@playwright/test');

function getPath(obj, path) {
  const parts = path.replace(/^\\$\\.?/, '').match(/[^.\\[\\]']+/g) || [];
  return parts.reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

test('dotnet-health', async ({ request }) => {
  const params = JSON.parse(process.env.DOTNET_HEALTH_PARAMS);

  const headers = { Accept: 'application/json' };
  for (const h of params.headers) {
    headers[h.key] = h.envVar ? process.env[h.envVar] : h.value;
  }

  const response = await request.get(process.env.CHECK_TARGET_URL, { headers, maxRedirects: 0 });
  const body = await response.json();

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
  if (warnings.length > 0) {
    require('fs').writeFileSync('degraded.json', JSON.stringify({ messages: warnings }));
  }
});
`;

export function factory(entry: DotnetHealthEntry, ctx: ProjectContext): MultiStepCheck {
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

  const { headerParams, environmentVariables: headerEnvVars } =
    resolveHeadersForScript(entry.logicalId, entry.headers);

  const healthParams = {
    statusPath: entry.statusPath ?? DEFAULT_STATUS_PATH,
    componentsPath: entry.componentsPath ?? DEFAULT_COMPONENTS_PATH,
    expectedComponents: entry.expectedComponents ?? [],
    healthyValues,
    degradedValues,
    failOnDegraded: entry.failOnDegraded ?? false,
    headers: headerParams,
  };

  const environmentVariables: Array<{ key: string; value: string }> = [
    { key: 'CHECK_TARGET_URL', value: targetUrl },
    { key: 'DOTNET_HEALTH_PARAMS', value: JSON.stringify(healthParams) },
    ...headerEnvVars,
  ];

  return new MultiStepCheck(entry.logicalId, {
    // Pass `targetUrl` as the url so the auto-composed name reflects the
    // actual endpoint hit (entry.url + healthPath) rather than the bare
    // base. Per-entry `name` overrides still win unchanged.
    name: buildCheckName(ctx.project, { ...entry, url: targetUrl }),
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    retryStrategy: RetryStrategyBuilder.noRetries(),
    tags,
    environmentVariables,
    code: { content: SCRIPT },
  });
}
