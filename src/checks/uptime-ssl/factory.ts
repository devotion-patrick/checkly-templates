import { ApiCheck, RetryStrategyBuilder } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { DEFAULT_SECURITY_HEADERS, KIND_VERSION, type UptimeSslEntry } from './schema.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_5M',
};

const DEFAULT_THRESHOLD_DAYS = 30;
const DEFAULT_SUCCESS_RANGE = { min: 200, max: 299 } as const;

// Runs after the request completes, with the real response in hand.
// followRedirects is off (see below), so a redirect is visible here as a
// 3xx statusCode rather than being resolved into whatever it points at --
// and it is treated the same as an out-of-range status: a real failure.
// A missing security header is a finding too, but a softer one: it throws
// a distinguishable "DEGRADED:" message instead of a plain one, since
// Checkly itself has no notion of assertion-level severity to ask -- the
// portal reads this message to tell "headers only" apart from an actual
// outage (see ChecklyHealthProvider.ToStatus).
const TEARDOWN_SCRIPT = `
const params = JSON.parse(process.env.UPTIME_SSL_PARAMS);
const status = response.statusCode;

const findings = [];
const warnings = [];

if (status >= 300 && status < 400) {
  const location = response.headers['location'] || response.headers['Location'] || 'unknown';
  findings.push('Received a redirect (HTTP ' + status + ' to ' + location + ') instead of a direct response.');
} else if (status < params.successMin || status > params.successMax) {
  findings.push('Received HTTP ' + status + ', expected ' + params.successMin + '-' + params.successMax + '.');
}

if (params.securityHeaders.length > 0) {
  const lowerKeys = Object.keys(response.headers).map((key) => key.toLowerCase());
  for (const want of params.securityHeaders) {
    if (!lowerKeys.includes(want.toLowerCase())) {
      warnings.push('Response header "' + want + '" is missing.');
    }
  }
}

console.log('uptime-ssl: ' + findings.length + ' finding(s), ' + warnings.length + ' warning(s).');
for (const w of warnings) console.log('  warning: ' + w);
for (const f of findings) console.log('  finding: ' + f);

if (findings.length > 0) {
  throw new Error(findings.join(' | '));
}
if (warnings.length > 0) {
  throw new Error('DEGRADED: ' + warnings.join(' | '));
}
`;

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

  const securityHeaders = entry.securityHeaders === false
    ? []
    : Array.isArray(entry.securityHeaders)
      ? entry.securityHeaders
      : [...DEFAULT_SECURITY_HEADERS];

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry, templateVersion: KIND_VERSION }),
    ctx.project.tags,
    entry.tags,
  );

  const params = {
    successMin: successRange.min,
    successMax: successRange.max,
    securityHeaders,
  };

  return new ApiCheck(entry.logicalId, {
    name: buildCheckName(ctx.project, entry),
    frequency: parseFrequency(frequencyName),
    // Checkly types `locations` as a strict `keyof Region` union; we
    // accept any string at the consumer boundary and trust the Checkly
    // CLI to reject unknown region IDs at deploy time.
    locations: locations as never[],
    activated: entry.activated ?? true,
    retryStrategy: RetryStrategyBuilder.noRetries(),
    tags,
    environmentVariables: [
      { key: 'UPTIME_SSL_PARAMS', value: JSON.stringify(params) },
    ],
    request: {
      method: 'GET',
      url: entry.url,
      // Off, deliberately, now: a redirect used to be resolved silently
      // and judged only on the destination's status. Turning it off makes
      // the redirect itself visible to the teardown script as a 3xx
      // statusCode, which now treats it as a failure in its own right.
      followRedirects: false,
    },
    tearDownScript: { content: TEARDOWN_SCRIPT },
  });
}
