import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'redirect' as const;

export interface RedirectEntry extends CommonEntryFields {
  kind: typeof KIND;
  expectedStatus?: number; // default 301
  expectedLocation: string; // exact match on the Location header
}

export const redirectSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'env', 'url', 'expectedLocation'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    expectedStatus: {
      type: 'integer',
      minimum: 300,
      maximum: 399,
      default: 301,
      description: 'Expected redirect status code. Default 301.',
    },
    expectedLocation: {
      type: 'string',
      minLength: 1,
      description: 'Exact value the Location header must equal.',
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
