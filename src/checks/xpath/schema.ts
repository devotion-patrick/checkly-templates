import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'xpath' as const;
// Bumped whenever this kind's factory/schema logic changes in a way
// that matters to an already-deployed check — i.e. pushing the same
// consumer config again would produce a materially different construct.
// Emitted as a `tmpl-version:<kind>@<version>` tag on every check (see
// @checkly-templates/shared/tags), so a consumer of this registry (e.g.
// a UI that pushes checks) can compare a deployed check's tag against
// this constant to know whether a newer template is available to push.
export const KIND_VERSION = '1.0.0';

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
