import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'xpath' as const;

export interface XpathExpectations {
  contains?: string[];
  notContains?: string[];
}

export interface XpathEntry extends CommonEntryFields {
  kind: typeof KIND;
  expect: XpathExpectations;
}

export const xpathSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url', 'expect'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    expect: {
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: {
        contains: { type: 'array', items: { type: 'string', minLength: 1 } },
        notContains: { type: 'array', items: { type: 'string', minLength: 1 } },
      },
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
