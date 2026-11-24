import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'gdpr' as const;
// Bumped whenever this kind's factory/schema logic changes in a way
// that matters to an already-deployed check — i.e. pushing the same
// consumer config again would produce a materially different construct.
// Emitted as a `tmpl-version:<kind>@<version>` tag on every check (see
// @checkly-templates/shared/tags), so a consumer of this registry (e.g.
// a UI that pushes checks) can compare a deployed check's tag against
// this constant to know whether a newer template is available to push.
//
// Bumped to 1.1.0: the GeoIP lookup called `AbortSignal.timeout`, which is
// not defined in Checkly's sandbox, so it threw on every run. The catch
// reported that as a failed lookup and forced `inRestricted: true`, meaning
// every deployed check of this kind was judging against region UNKNOWN --
// the strictest answer -- rather than where it actually ran.
//
// Bumped to 1.2.0: a violation reports Degraded rather than failing the
// run. Cookies before consent is a compliance problem to schedule, not the
// site being down, and reporting it as a failure put it in the same list as
// genuine outages.
//
// Bumped to 1.3.0: findings are ranked and grouped worst-first, so an
// advertising identifier is not reported as the equal of a cookie probe
// that stores nothing.
//
// Bumped to 2.0.0: findings are graded INFO / WARN / FAIL against a check
// level (report, standard, strict), and FAIL now fails the run. 1.2.0's
// Degraded-for-everything meant a compliance check could not fail CI.
// Degraded is kept for WARN-only runs, e.g. Consent Mode advanced pings
// under standard.
//
// Bumped to 3.0.0: one check per location, logicalId suffixed with the
// location, CHECK_LOCATION set on each. Checkly's Playwright checks don't
// expose the run location, so targeted mode relied on ipapi.co from shared
// IPs and got 429s. Redeploying replaces the old single check.
//
// Bumped to 3.1.0: tracking domains match the listed host and its
// subdomains. Requests were reduced to their registrable domain first, so
// entries like bat.bing.com, analytics.tiktok.com and snap.licdn.com never
// matched and those requests went undetected.
//
// Bumped to 3.2.0: facebook.com added to the preset's trackingDomains. Meta
// pixel hits go to facebook.com/tr, so only the facebook.net script load
// was caught, and a pixel fired without it went undetected.
//
// Bumped to 3.3.0: California removed from the preset (US-CA, us-west-1),
// now covered by the ccpa kind. CCPA is opt-out, so holding California runs
// to GDPR's opt-in rule failed CCPA-compliant sites. Preset renamed eu-uk;
// eu-uk-ca kept as an alias.
//
// Bumped to 3.4.0: browser checks' REGION is read for the run location
// (only CHECKLY_REGION was, which only Playwright Check Suites set), and a
// Consent Mode advanced cookieless ping is INFO under standard, not WARN,
// so a run doing what standard accepts no longer reports Degraded.
export const KIND_VERSION = '3.4.0';

export type ComplianceMode = 'global' | 'targeted';
export type CheckLevel = 'report' | 'standard' | 'strict';
export type GdprPresetName = 'eu-uk' | 'eu-uk-ca' | 'none';

export interface GdprOverrides {
  trackingDomains?: {
    add?: string[];
    remove?: string[];
  };
  cookieBlocklist?: {
    add?: Record<string, string[]>;
    remove?: string[]; // category names to drop
  };
  restrictedRegions?: {
    add?: string[];
    remove?: string[];
  };
  restrictedChecklyLocations?: {
    add?: string[];
    remove?: string[];
  };
  gtmDomain?: string;
}

export interface GdprCustomRules {
  trackingDomains: string[];
  cookieBlocklist: Record<string, string[]>;
  restrictedRegions: string[];
  restrictedChecklyLocations: string[];
  gtmDomain: string;
}

export interface GdprEntry extends CommonEntryFields {
  kind: typeof KIND;
  complianceMode: ComplianceMode;
  checkLevel?: CheckLevel;
  preset?: GdprPresetName;
  overrides?: GdprOverrides;
  rules?: GdprCustomRules;
}

export const gdprSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url', 'complianceMode'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    complianceMode: {
      enum: ['global', 'targeted'],
      description:
        '`global` enforces everywhere; `targeted` enforces only when the check runs from a restricted region (EU/EEA, UK). Out-of-region runs in `targeted` mode log findings but pass.',
    },
    checkLevel: {
      enum: ['report', 'standard', 'strict'],
      description:
        'How strictly to grade tracking before consent. `report` logs every finding and never fails; `standard` accepts Google Consent Mode advanced: denied-state cookieless pings pass without degrading the run (logged as INFO); `strict` fails any tracking request before consent. Overrides the GDPR_CHECK_LEVEL env var for this site. Default `standard`.',
    },
    preset: {
      enum: ['eu-uk', 'eu-uk-ca', 'none'],
      default: 'eu-uk',
      description:
        'Built-in rule set. `eu-uk` covers EU/EEA and UK GDPR; California is opt-out and covered by the `ccpa` kind. `eu-uk-ca` is the pre-3.3.0 name, kept as an alias for `eu-uk` (it no longer includes California). Use `"none"` plus `rules` to supply a fully custom rule set.',
    },
    overrides: {
      type: 'object',
      additionalProperties: false,
      description: 'Surgical edits to the preset.',
      properties: {
        trackingDomains: {
          type: 'object',
          additionalProperties: false,
          properties: {
            add: { type: 'array', items: { type: 'string' } },
            remove: { type: 'array', items: { type: 'string' } },
          },
        },
        cookieBlocklist: {
          type: 'object',
          additionalProperties: false,
          properties: {
            add: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
            remove: { type: 'array', items: { type: 'string' } },
          },
        },
        restrictedRegions: {
          type: 'object',
          additionalProperties: false,
          properties: {
            add: { type: 'array', items: { type: 'string' } },
            remove: { type: 'array', items: { type: 'string' } },
          },
        },
        restrictedChecklyLocations: {
          type: 'object',
          additionalProperties: false,
          properties: {
            add: { type: 'array', items: { type: 'string' } },
            remove: { type: 'array', items: { type: 'string' } },
          },
        },
        gtmDomain: { type: 'string' },
      },
    },
    rules: {
      type: 'object',
      additionalProperties: false,
      description: 'Full custom rule set; only meaningful when `preset: "none"`.',
      required: ['trackingDomains', 'cookieBlocklist', 'restrictedRegions', 'restrictedChecklyLocations', 'gtmDomain'],
      properties: {
        trackingDomains: { type: 'array', items: { type: 'string' } },
        cookieBlocklist: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
        restrictedRegions: { type: 'array', items: { type: 'string' } },
        restrictedChecklyLocations: { type: 'array', items: { type: 'string' } },
        gtmDomain: { type: 'string' },
      },
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
