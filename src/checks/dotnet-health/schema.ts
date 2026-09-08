import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'dotnet-health' as const;
// Bumped whenever this kind's factory/schema logic changes in a way
// that matters to an already-deployed check — i.e. pushing the same
// consumer config again would produce a materially different construct.
// Emitted as a `tmpl-version:<kind>@<version>` tag on every check (see
// @checkly-templates/shared/tags), so a consumer of this registry (e.g.
// a UI that pushes checks) can compare a deployed check's tag against
// this constant to know whether a newer template is available to push.
export const KIND_VERSION = '1.0.0';

export interface DotnetHealthEntry extends CommonEntryFields {
  kind: typeof KIND;
  // Optional path appended to `url`. Set this to "/health" (or similar)
  // if your `url` is the base URL of the service. Leave unset if `url`
  // already points at the health endpoint.
  healthPath?: string;
  // Each must report a healthy (or, unless failOnDegraded, degraded)
  // value at `componentsPath` with `{name}` substituted.
  expectedComponents?: string[];
  // Deprecated alias for healthyValues: [expectedOverallStatus]. Still
  // honoured when healthyValues is unset, so existing configs keep
  // working unchanged.
  expectedOverallStatus?: string;
  // JSONPath to the overall status field. Default "$.status" — the
  // ASP.NET Core HealthCheck contract's top-level field. Override for
  // health endpoints that don't use that exact shape.
  statusPath?: string;
  // JSONPath template for a named component's status, with "{name}"
  // substituted for each entry in expectedComponents. Default
  // "$.results['{name}'].status". Note: the ASP.NET Core
  // AspNetCore.HealthChecks.UI.Client package's default response writer
  // actually nests components under "entries", not "results" — check
  // your endpoint's real response shape and override this if needed.
  componentsPath?: string;
  // Values (at statusPath, or at componentsPath per component) that
  // count as fully healthy. Default ["Healthy"]. Superseded by
  // expectedOverallStatus only when this is left unset.
  healthyValues?: string[];
  // Values that count as degraded — reported as a warning (the check
  // still passes) rather than a failure, unless failOnDegraded is true.
  // Default ["Degraded"]. Anything not in healthyValues or
  // degradedValues is treated as unhealthy and fails the check.
  degradedValues?: string[];
  // Default false: degraded reports a warning without failing the
  // check. Set true to treat degraded the same as unhealthy (hard
  // fail) for teams with zero tolerance for a degraded dependency.
  failOnDegraded?: boolean;
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
      description: 'Named components checked at componentsPath (default "$.results[\'{name}\'].status") with the same healthy/degraded/unhealthy severity as the overall status.',
    },
    expectedOverallStatus: {
      type: 'string',
      description: 'Deprecated alias for healthyValues: [expectedOverallStatus]. Only used when healthyValues is unset.',
    },
    statusPath: {
      type: 'string',
      default: '$.status',
      description: 'JSONPath to the overall status field.',
    },
    componentsPath: {
      type: 'string',
      default: "$.results['{name}'].status",
      description: 'JSONPath template for a named component\'s status; "{name}" is substituted per entry in expectedComponents. The AspNetCore.HealthChecks.UI.Client default writer nests components under "entries", not "results" — verify against your real response.',
    },
    healthyValues: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1,
      default: ['Healthy'],
      description: 'Values that count as fully healthy.',
    },
    degradedValues: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1,
      default: ['Degraded'],
      description: 'Values that count as degraded — a warning, not a failure, unless failOnDegraded is true. Anything not healthy or degraded fails the check.',
    },
    failOnDegraded: {
      type: 'boolean',
      default: false,
      description: 'Treat degraded the same as unhealthy (hard fail) instead of a non-blocking warning.',
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
