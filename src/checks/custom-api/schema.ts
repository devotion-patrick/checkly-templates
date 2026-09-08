import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'custom-api' as const;
// Bumped whenever this kind's factory/schema logic changes in a way
// that matters to an already-deployed check — i.e. pushing the same
// consumer config again would produce a materially different construct.
// Emitted as a `tmpl-version:<kind>@<version>` tag on every check (see
// @checkly-templates/shared/tags), so a consumer of this registry (e.g.
// a UI that pushes checks) can compare a deployed check's tag against
// this constant to know whether a newer template is available to push.
export const KIND_VERSION = '1.0.0';

export interface CustomApiEntry extends CommonEntryFields {
  kind: typeof KIND;
  // HTTP method for the request. Default "GET".
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  // Optional request body (e.g. a JSON string for POST/PUT).
  body?: string;
  // Extra request headers. Each entry must set either `value` (a literal
  // string) or `valueFromEnv` (the name of an environment variable read
  // at DEPLOY time and stashed as a per-check Checkly env var). Same
  // mechanism as dotnet-health — see that kind's README for the full
  // secret-plumbing walkthrough (Key Vault -> CI variable -> here).
  headers?: Array<{ key: string; value?: string; valueFromEnv?: string }>;
  // The full validation script, run as this check's tearDownScript (see
  // https://www.checklyhq.com/docs/detect/synthetic-monitoring/api-checks/setup-and-teardown/) —
  // i.e. it runs after the request completes, with `response` (status,
  // body, headers) and `request` in scope, plus `process.env`. Throw an
  // Error to fail the check; console.log for non-blocking notes. This is
  // the field a UI's script editor should write to and validate against
  // that contract — there's no separate "assertions" field on this kind,
  // the script is the entire validation.
  script: string;
}

export const customApiSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url', 'script'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    method: {
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
      default: 'GET',
    },
    body: {
      type: 'string',
      description: 'Optional request body.',
    },
    headers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key'],
        properties: {
          key: { type: 'string', minLength: 1 },
          value: { type: 'string', description: 'Literal header value.' },
          valueFromEnv: {
            type: 'string',
            minLength: 1,
            description:
              'Name of a process env var read at deploy time. Becomes a per-check Checkly env var; the header value is set to `{{<name>}}` which Checkly resolves server-side at run time. Use this for secrets so they live in your CI vault, not this config file.',
          },
        },
        oneOf: [
          { required: ['value'], not: { required: ['valueFromEnv'] } },
          { required: ['valueFromEnv'], not: { required: ['value'] } },
        ],
      },
      description: 'Extra request headers. Each item sets exactly one of `value` (literal) or `valueFromEnv` (CI-sourced, per-check secret).',
    },
    script: {
      type: 'string',
      minLength: 1,
      description:
        'Full validation script, run as this check\'s tearDownScript: `response` (status/body/headers), `request`, and `process.env` are in scope; throw an Error to fail the check, console.log for non-blocking notes.',
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
