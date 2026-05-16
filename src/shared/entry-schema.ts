import { FREQUENCY_NAMES } from './frequency.ts';

// Reusable JSON-Schema fragments every kind drops into its discriminated
// arm. Keeps the common-entry shape defined once instead of duplicated
// across six kind modules.

export const commonEntryProperties = {
  logicalId: {
    type: 'string',
    minLength: 1,
    pattern: '^[a-z0-9][a-z0-9-]*$',
    description: 'Stable kebab-case slug. Renaming is destructive in Checkly.',
  },
  env: {
    type: 'string',
    minLength: 1,
    description: 'Free-form environment label (e.g. PROD / UAT). Drives the auto-emitted env tag.',
  },
  url: {
    type: 'string',
    format: 'uri',
    description: 'Absolute URL the check exercises.',
  },
  tags: {
    type: 'array',
    items: { type: 'string' },
    description: 'Extra tags merged with the auto-emitted set.',
  },
  activated: {
    type: 'boolean',
    description: 'Whether the check is scheduled (defaults to true).',
    default: true,
  },
  frequency: {
    enum: [...FREQUENCY_NAMES],
    description: 'Override the project default frequency.',
  },
  locations: {
    type: 'array',
    items: { type: 'string' },
    minItems: 1,
    description: 'Override the project default location set.',
  },
  smoke: {
    type: 'boolean',
    description:
      'Include this entry when the pipeline runs in smoke-gate mode (CHECKLY_PURPOSE=test, `checkly test`). At least one of `smoke` or `monitor` must be true.',
  },
  monitor: {
    type: 'boolean',
    description:
      'Include this entry when the pipeline runs in continuous-monitor mode (CHECKLY_PURPOSE=monitor, `checkly deploy`). At least one of `smoke` or `monitor` must be true.',
  },
} as const;

export const commonRequired = ['kind', 'logicalId', 'env', 'url'] as const;

// JSON-Schema fragment to inject into each kind's top level via `allOf`,
// enforcing that at least one of `smoke` / `monitor` is explicitly `true`.
// We intentionally do not default either to true so consumers have to
// declare intent per check.
export const smokeOrMonitorConstraint = {
  anyOf: [
    { properties: { smoke: { const: true } }, required: ['smoke'] },
    { properties: { monitor: { const: true } }, required: ['monitor'] },
  ],
  errorMessage: 'Each check must set `smoke: true`, `monitor: true`, or both.',
} as const;
