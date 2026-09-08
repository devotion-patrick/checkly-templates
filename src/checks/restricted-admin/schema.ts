import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'restricted-admin' as const;
// Bumped whenever this kind's factory/schema logic changes in a way
// that matters to an already-deployed check — i.e. pushing the same
// consumer config again would produce a materially different construct.
// Emitted as a `tmpl-version:<kind>@<version>` tag on every check (see
// @checkly-templates/shared/tags), so a consumer of this registry (e.g.
// a UI that pushes checks) can compare a deployed check's tag against
// this constant to know whether a newer template is available to push.
export const KIND_VERSION = '1.0.0';

export interface RestrictedAdminEntry extends CommonEntryFields {
  kind: typeof KIND;
  /**
   * Whether this admin/CMS URL should be network-level gated:
   *  - "gated": must require auth — reachable without it (2xx) is
   *    itself the failure, and no other checks run. A non-2xx (401/403)
   *    is the expected, passing state (see the login-form vs
   *    homepage-duplicate distinction below).
   *  - "either": public access is a legitimate per-client choice, not a
   *    defect either way (e.g. editors need to log in from arbitrary
   *    locations). Never fails on accessibility alone; only
   *    `securityHeaders` runs, when reachable — those matter regardless
   *    of whether the endpoint is meant to be public.
   * No default: unlike a general-purpose kind, there's no safe universal
   * assumption here, and this is the one thing the check exists to
   * assert — every entry must state it explicitly.
   */
  expectedAccess: 'gated' | 'either';
  /**
   * Response headers to require when the endpoint is reachable. Also
   * checked in "gated" mode's exception path: a "gated" endpoint that
   * turns out to be reachable is either a real login form (full-severity
   * failure) or the site's homepage served by mistake (downgraded to a
   * warning) — see the same distinction in launch-readiness's
   * expectPubliclyAccessible doc, whose spec this kind reuses verbatim.
   */
  securityHeaders?: string[];
  /** waitUntil for the page load. Default "domcontentloaded". */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  /**
   * Some admin pages fire a client-side (JS) redirect after load (e.g.
   * bouncing to a login screen). Default false: report it as a finding
   * and stop there. Set true to follow it and audit the destination
   * instead.
   */
  followJsRedirect?: boolean;
}

export const restrictedAdminSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url', 'expectedAccess'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    expectedAccess: {
      enum: ['gated', 'either'],
      description:
        '"gated": must require auth, reachable-without-it fails. "either": public access is an accepted per-client choice; only securityHeaders is checked.',
    },
    securityHeaders: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1,
      description: 'Response headers required when the endpoint is reachable.',
    },
    waitUntil: {
      enum: ['load', 'domcontentloaded', 'networkidle'],
      default: 'domcontentloaded',
    },
    followJsRedirect: {
      type: 'boolean',
      default: false,
      description: 'Follow a client-side (JS) redirect that fires after load, instead of reporting it and stopping.',
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
