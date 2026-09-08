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
// Bumped to 1.1.0 for snippetId, 1.2.0 for path (see below): pushing the
// same config again produces the same construct, but a config that adds a
// path is a materially different one, and this is the version tag that
// says so.
export const KIND_VERSION = '1.2.0';

export interface CustomApiEntry extends CommonEntryFields {
  kind: typeof KIND;
  // A path appended to `url` before the request is built, e.g.
  // "/CMSPages/Devotion/HealthCheck/DealerList.ashx".
  //
  // **Portal-only plumbing, not read by this repo's own factory.** Here,
  // `url` (from CommonEntryFields) is already the full absolute address a
  // consumer of this schema sets directly -- this field exists only because
  // the Devotion portal's own configuration derives `url` from an
  // application's hostname rather than letting a consumer type one, and a
  // hostname is a domain, not a specific endpoint under it. The portal
  // appends this to that hostname's address before validating, so `url`
  // never needs setting by hand there. A consumer that already sets `url`
  // itself -- this repo's own deploy pipeline included -- has no use for it.
  path?: string;
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
  // the script is the entire validation. Mutually exclusive with
  // `snippetId` — exactly one of the two is required.
  script?: string;
  // A Checkly account-level Snippet's numeric id, run as this check's
  // teardown validation in place of an inline `script`. Mutually exclusive
  // with `script`.
  //
  // **Only meaningful for a consumer deploying via Checkly's REST API
  // directly (e.g. the Devotion portal), not for this repo's own
  // `checkly deploy` pipeline.** Checkly's docs are explicit that
  // account-level Snippets are unavailable to a CLI/constructs-managed
  // check — "Snippets are not supported in CLI-managed checks" — because
  // that path bundles local files under `./snippets` at build time
  // instead. `factory.ts` therefore refuses a config that sets this
  // rather than silently ignoring it; a REST-API consumer's own builder
  // is where `snippetId` actually reaches Checkly, as `tearDownSnippetId`
  // on the check body.
  snippetId?: number;
}

// Exactly one of `script` / `snippetId`, never both and never neither --
// the entire validation has to come from somewhere, and from exactly one
// place, or a config that set both would leave "which one actually runs"
// to be discovered at deploy time rather than stated.
//
// Declared before `customApiSchemaFragment` on purpose: a `const` referenced
// from another `const`'s initializer must already exist when that
// initializer runs, and importing this module is exactly that -- both are
// evaluated top-to-bottom the moment something imports the schema.
const scriptOrSnippetConstraint = {
  oneOf: [
    { required: ['script'], not: { required: ['snippetId'] } },
    { required: ['snippetId'], not: { required: ['script'] } },
  ],
  errorMessage: 'Set exactly one of `script` (inline) or `snippetId` (a Checkly Snippet), not both.',
} as const;

export const customApiSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    path: {
      type: 'string',
      description:
        'Appended to `url` before the request is built. Portal-only plumbing: a consumer that already sets `url` to the full address (this repo\'s own deploy pipeline included) has no use for this.',
    },
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
        'Full validation script, run as this check\'s tearDownScript: `response` (status/body/headers), `request`, and `process.env` are in scope; throw an Error to fail the check, console.log for non-blocking notes. Mutually exclusive with `snippetId`.',
    },
    snippetId: {
      type: 'integer',
      minimum: 1,
      description:
        'A Checkly account-level Snippet\'s id, run as this check\'s teardown validation instead of an inline script. Mutually exclusive with `script`. REST-API consumers only -- this repo\'s own CLI deploy refuses a config that sets it, since Checkly does not support account Snippets for a CLI/constructs-managed check.',
    },
  },
  allOf: [smokeOrMonitorConstraint, scriptOrSnippetConstraint],
} as const;
