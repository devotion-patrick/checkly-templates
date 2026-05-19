import pkg from '../../package.json' with { type: 'json' };
import { FREQUENCY_NAMES } from '@checkly-templates/shared/frequency';
import { MODULES } from './registry.ts';
import type { JsonSchemaFragment } from './types.ts';

// Pinning $id to the versioned release-asset URL means consumers who
// reference this schema by tag (e.g. `releases/download/v0.1.0/schema.json`)
// always get a schema whose $id matches the URL it was served from. Bump
// `version` in the root package.json before tagging a release; CI's
// `build-schema.mjs --check` enforces freshness.
const SCHEMA_VERSION = `v${pkg.version}`;
const SCHEMA_URL =
  `https://github.com/devotion-patrick/checkly-templates/releases/download/${SCHEMA_VERSION}/schema.json`;

const projectSchema: JsonSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['logicalId', 'name'],
  properties: {
    $comment: {
      type: 'string',
      description: 'Free-form annotation. Ignored at deploy time; useful for documenting project intent.',
    },
    logicalId: {
      type: 'string',
      minLength: 1,
      pattern: '^[a-z0-9][a-z0-9-]*$',
      description: 'Stable kebab-case slug. Becomes the Checkly project logicalId.',
    },
    name: {
      type: 'string',
      minLength: 1,
      description: 'Human-readable project name shown in the Checkly UI.',
    },
    codename: {
      type: 'string',
      minLength: 1,
      description: 'Short app codename; required when tagPrefix is set so the auto-emitted codename: tag has a value.',
    },
    tagPrefix: {
      type: 'string',
      minLength: 1,
      description: 'Prefix for the auto-emitted app/env/kind tags. The `source:checkly-templates` tag is always emitted bare.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Free-form tags applied to every check.',
    },
    defaults: {
      type: 'object',
      additionalProperties: false,
      properties: {
        $comment: {
          type: 'string',
          description: 'Free-form annotation. Ignored at deploy time.',
        },
        env: {
          type: 'string',
          minLength: 1,
          description:
            'Default environment label (e.g. PROD / UAT) applied to every entry that does not set its own `env`. Drives the auto-emitted env tag.',
        },
        frequency: { enum: [...FREQUENCY_NAMES] },
        locations: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
    },
  },
  allOf: [
    {
      if: { required: ['tagPrefix'] },
      then: { required: ['codename'] },
    },
  ],
};

export function buildSchema(): JsonSchemaFragment {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: SCHEMA_URL,
    title: `Checkly templates consumer config (${SCHEMA_VERSION})`,
    type: 'object',
    additionalProperties: false,
    required: ['project', 'checks'],
    properties: {
      $schema: { type: 'string' },
      $comment: {
        type: 'string',
        description: 'Free-form annotation. Ignored at deploy time; useful for documenting file-level intent.',
      },
      project: projectSchema,
      checks: {
        type: 'array',
        minItems: 1,
        items: {
          oneOf: MODULES.map((m) => m.schemaFragment),
        },
      },
    },
  };
}
