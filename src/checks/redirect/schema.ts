import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'redirect' as const;
// Bumped whenever this kind's factory/schema logic changes in a way
// that matters to an already-deployed check — i.e. pushing the same
// consumer config again would produce a materially different construct.
// Emitted as a `tmpl-version:<kind>@<version>` tag on every check (see
// @checkly-templates/shared/tags), so a consumer of this registry (e.g.
// a UI that pushes checks) can compare a deployed check's tag against
// this constant to know whether a newer template is available to push.
export const KIND_VERSION = '1.0.0';

export interface RedirectEntry extends CommonEntryFields {
  kind: typeof KIND;
  expectedStatus?: number; // default 301
  expectedLocation: string; // exact match on the Location header
}

export const redirectSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url', 'expectedLocation'],
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
