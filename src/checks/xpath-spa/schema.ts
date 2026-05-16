import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'xpath-spa' as const;

export interface XpathSpaSelector {
  // Any Playwright locator string: CSS selector, "text=...", "xpath=..." etc.
  selector: string;
  // At least one of the following must be present; checked in order.
  equals?: string;
  contains?: string;
  notContains?: string;
  // If set, the assertion is on the named attribute instead of textContent.
  attribute?: string;
  // Number of expected matches. Optional; when set, asserts locator.count().
  count?: number;
}

export interface XpathSpaEntry extends CommonEntryFields {
  kind: typeof KIND;
  expect: XpathSpaSelector[];
  // Optional waitUntil override. Default "domcontentloaded".
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

export const xpathSpaSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'env', 'url', 'expect'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    waitUntil: {
      enum: ['load', 'domcontentloaded', 'networkidle'],
      default: 'domcontentloaded',
      description: 'Playwright `page.goto` waitUntil. Default `domcontentloaded`.',
    },
    expect: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['selector'],
        properties: {
          selector: { type: 'string', minLength: 1 },
          equals: { type: 'string' },
          contains: { type: 'string' },
          notContains: { type: 'string' },
          attribute: { type: 'string', minLength: 1 },
          count: { type: 'integer', minimum: 0 },
        },
        anyOf: [
          { required: ['equals'] },
          { required: ['contains'] },
          { required: ['notContains'] },
          { required: ['count'] },
        ],
      },
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
