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
// Bumped to 3.0.0: the underlying construct changed from ApiCheck to
// UrlMonitor. Patrick: "i need uptime-ssl to use the FREE frequency
// check. the literal uptime monitor. so this can run every minute
// without incurring a billion costs." A UrlMonitor is billed by monitor
// count, not by run, unlike every other kind in this repository -- which
// is exactly why it can default to EVERY_1M for free where an ApiCheck
// could not. The tradeoff is that a UrlMonitor is declarative-only (status
// code assertions, no script), so `securityHeaders` moved out to its own
// `security-headers` kind, which still needs a scriptable runtime to
// report Degraded.
//
// Bumped to 3.1.0: `followRedirects` became a setting rather than a
// hardcoded false, and it defaults to true. An uptime check answers "can
// a visitor reach this site", and a visitor follows the redirect -- a
// host answering 301 to its https or www form is reachable, not down.
// Redeploying an existing check moves it onto the new default, which is
// the intended correction rather than a side effect.
export const KIND_VERSION = '3.1.0';

export interface UptimeSslEntry extends CommonEntryFields {
  kind: typeof KIND;
  // Days before TLS expiry to start alerting. Default 30.
  sslCertificateExpiryThresholdDays?: number;
  // Acceptable success status range. Default: 200-299.
  successStatusRange?: { min: number; max: number };
  // Whether to follow redirects before asserting. Default true.
  followRedirects?: boolean;
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
    followRedirects: {
      type: 'boolean',
      default: true,
      description:
        'Follow redirects before asserting the status code. Defaults to true, because a visitor '
        + 'follows them too: a host answering 301 to its https or www form is reachable. Turn it '
        + 'off to assert on the redirect response itself, though the redirect kind is built for that.',
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
