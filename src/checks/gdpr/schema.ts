import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'gdpr' as const;

export type ComplianceMode = 'global' | 'targeted';
export type GdprPresetName = 'eu-uk-ca' | 'none';

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
        '`global` enforces everywhere; `targeted` enforces only when the check runs from a restricted region (EU/UK/CA). Out-of-region runs in `targeted` mode log findings but pass.',
    },
    preset: {
      enum: ['eu-uk-ca', 'none'],
      default: 'eu-uk-ca',
      description: 'Built-in rule set. Use `"none"` plus `rules` to supply a fully custom rule set.',
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
