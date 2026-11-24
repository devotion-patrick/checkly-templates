import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';
import { californiaChecklyLocations } from '@checkly-templates/shared/presets/ccpa-ca';

export const KIND = 'ccpa' as const;
// Emitted as a `tmpl-version:ccpa@<version>` tag; see the gdpr kind's schema.ts.
// 1.1.0: flagged hits and hit-less ad scripts after GPC are INFO under
// standard, not WARN, so an accepted run doesn't report Degraded; the
// location line reads CHECKLY_REGION or REGION when CHECK_LOCATION is unset.
export const KIND_VERSION = '1.1.0';

export type CheckLevel = 'report' | 'standard' | 'strict';

interface AddRemove {
  add?: string[];
  remove?: string[];
}

export interface CcpaOverrides {
  adTechDomains?: AddRemove;
  analyticsDomains?: AddRemove;
  adCookieBlocklist?: {
    add?: Record<string, string[]>;
    remove?: string[]; // category names to drop
  };
  optOutLinkPatterns?: AddRemove;
  /** CSS selectors for an opt-out link the text patterns miss, e.g. a CMP's footer button. */
  optOutSelectors?: string[];
}

export interface CcpaRules {
  adTechDomains: string[];
  analyticsDomains: string[];
  adCookieBlocklist: Record<string, string[]>;
  optOutLinkPatterns: string[];
  optOutSelectors: string[];
}

export interface CcpaEntry extends CommonEntryFields {
  kind: typeof KIND;
  checkLevel?: CheckLevel;
  overrides?: CcpaOverrides;
}

const addRemove = {
  type: 'object',
  additionalProperties: false,
  properties: {
    add: { type: 'array', items: { type: 'string' } },
    remove: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const ccpaSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url', 'locations'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    locations: {
      type: 'array',
      minItems: 1,
      items: { enum: [...californiaChecklyLocations] },
      description:
        'Required, and California only: sites gate their CCPA behaviour on the visitor\'s IP, so the check must run from there. Project default locations are not used.',
    },
    checkLevel: {
      enum: ['report', 'standard', 'strict'],
      description:
        'How strictly to grade tracking after a GPC opt-out. `report` logs and never fails; `standard` accepts vendor restricted-processing flags (Google rdp/npa, Meta LDU): they pass without degrading the run (logged as INFO); `strict` fails them. Overrides the CCPA_CHECK_LEVEL env var for this site. Default `standard`.',
    },
    overrides: {
      type: 'object',
      additionalProperties: false,
      description: 'Surgical edits to the California preset.',
      properties: {
        adTechDomains: addRemove,
        analyticsDomains: addRemove,
        adCookieBlocklist: {
          type: 'object',
          additionalProperties: false,
          properties: {
            add: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
            remove: { type: 'array', items: { type: 'string' } },
          },
        },
        optOutLinkPatterns: addRemove,
        optOutSelectors: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
