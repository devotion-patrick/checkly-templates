import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'dotnet-health' as const;

export interface DotnetHealthEntry extends CommonEntryFields {
  kind: typeof KIND;
  // Optional path appended to `url`. Set this to "/health" (or similar)
  // if your `url` is the base URL of the service. Leave unset if `url`
  // already points at the health endpoint.
  healthPath?: string;
  // Each must report status === "Healthy" in the response JSON's
  // results object (the ASP.NET Core HealthCheck contract).
  expectedComponents?: string[];
  // Acceptable value for $.status. Default "Healthy".
  expectedOverallStatus?: string;
  // Extra request headers to send with the GET. Each entry must set
  // either `value` (a literal string) or `valueFromEnv` (the name of an
  // environment variable read at DEPLOY time and stashed as a per-check
  // env var on the resulting Checkly construct). Use `valueFromEnv` for
  // any secret you don't want sitting in this config file; it lives in
  // your CI's secret store, gets read once when the pipeline deploys,
  // and ends up scoped to this one check (not account-global).
  //
  // Example with a CI-sourced secret:
  //   "headers": [{ "key": "X-Health-Key", "valueFromEnv": "HEALTH_KEY" }]
  //
  // The factory throws at deploy time if `HEALTH_KEY` isn't set in the
  // process environment, so a missing secret fails the pipeline loudly.
  headers?: Array<{ key: string; value?: string; valueFromEnv?: string }>;
}

export const dotnetHealthSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    healthPath: {
      type: 'string',
      description: 'Optional path appended to `url`. Omit if `url` already points at the health endpoint; set to e.g. "/health" if `url` is just the base URL of the service.',
      pattern: '^/.*',
    },
    expectedComponents: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Named components whose status must report Healthy. Maps to `$.results.<name>.status`.',
    },
    expectedOverallStatus: {
      type: 'string',
      default: 'Healthy',
      description: 'Value $.status must equal.',
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
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
