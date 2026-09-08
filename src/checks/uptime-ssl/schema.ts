import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'uptime-ssl' as const;
// Bumped whenever this kind's factory/schema logic changes in a way
// that matters to an already-deployed check — i.e. pushing the same
// consumer config again would produce a materially different construct.
// Emitted as a `tmpl-version:<kind>@<version>` tag on every check (see
// @checkly-templates/shared/tags), so a consumer of this registry (e.g.
// a UI that pushes checks) can compare a deployed check's tag against
// this constant to know whether a newer template is available to push.
//
// Bumped to 2.0.0: a redirect used to be followed silently and judged only
// on where it landed; it is now a failure in its own right. securityHeaders
// is new (default on).
export const KIND_VERSION = '2.0.0';

// The baseline security-header set, applied when `securityHeaders` is left
// at its default `true`. Mirrors the launch-readiness kind's own example
// list so the two kinds agree on what "the standard headers" means.
export const DEFAULT_SECURITY_HEADERS = [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Strict-Transport-Security',
  'Referrer-Policy',
  'Content-Security-Policy',
] as const;

export interface UptimeSslEntry extends CommonEntryFields {
  kind: typeof KIND;
  // Days before TLS expiry to start alerting. Default 30.
  sslCertificateExpiryThresholdDays?: number;
  // Acceptable success status range. Default: 200-299.
  successStatusRange?: { min: number; max: number };
  // Response headers required to be present. `true` (default): the baseline
  // set above. `false`: skip the header check entirely. An array: check
  // exactly these instead. A missing header degrades the check; it does not
  // mark it down the way a redirect or an out-of-range status does.
  securityHeaders?: boolean | string[];
}

export const uptimeSslSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    sslCertificateExpiryThresholdDays: {
      type: 'integer',
      minimum: 1,
      maximum: 365,
      default: 30,
      description: 'Alert when the TLS cert is within this many days of expiry.',
    },
    successStatusRange: {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max'],
      properties: {
        min: { type: 'integer', minimum: 100, maximum: 599 },
        max: { type: 'integer', minimum: 100, maximum: 599 },
      },
      description: 'Inclusive status-code range counted as success. Defaults to 200-299.',
    },
    securityHeaders: {
      oneOf: [
        { type: 'boolean' },
        { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
      ],
      default: true,
      description:
        'Response headers required to be present. true: a baseline set '
        + `(${DEFAULT_SECURITY_HEADERS.join(', ')}). false: skip. An array: `
        + 'check exactly these instead. A missing header degrades the check '
        + 'rather than marking it down.',
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
