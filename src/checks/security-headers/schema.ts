import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'security-headers' as const;
// Bumped whenever this kind's factory/schema logic changes in a way
// that matters to an already-deployed check — i.e. pushing the same
// consumer config again would produce a materially different construct.
// Emitted as a `tmpl-version:<kind>@<version>` tag on every check (see
// @checkly-templates/shared/tags), so a consumer of this registry (e.g.
// a UI that pushes checks) can compare a deployed check's tag against
// this constant to know whether a newer template is available to push.
export const KIND_VERSION = '1.0.0';

// Split out of uptime-ssl (D94, then walked back): Patrick wanted uptime
// monitoring on a free UrlMonitor, which cannot run a script at all, so
// the header check needed a kind of its own with a scriptable runtime.
// The baseline set, applied when `securityHeaders` is left unset. Mirrors
// the launch-readiness kind's own example list so the two kinds agree on
// what "the standard headers" means -- deliberately not shared code with
// that kind, which stays untouched (it is already the more comprehensive
// check, and this one exists so uptime-ssl's own removal doesn't leave a
// gap for a client who only wants this one thing).
export const DEFAULT_SECURITY_HEADERS = [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Strict-Transport-Security',
  'Referrer-Policy',
  'Content-Security-Policy',
] as const;

export interface SecurityHeadersEntry extends CommonEntryFields {
  kind: typeof KIND;
  // Headers required to be present. Default: the baseline set above.
  securityHeaders?: string[];
}

export const securityHeadersSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    securityHeaders: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1,
      description:
        'Response headers required to be present. Default: the baseline set '
        + `(${DEFAULT_SECURITY_HEADERS.join(', ')}).`,
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
