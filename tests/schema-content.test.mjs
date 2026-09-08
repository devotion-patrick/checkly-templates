// Invariants about the generated deploy/schema.json. Consumers reference
// this schema via `$schema` and rely on these structural properties for
// IDE autocomplete + validation; treating any of them as load-bearing.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
import { repoRoot } from './helpers.mjs';

// Build a fresh schema from source for these tests. We can't reuse the
// shared `schema` import from helpers.mjs because Ajv mutates the
// schema object in-place during compilation (adds internal $ref state),
// so once any other test has compiled it, the byte-identity assertion
// below would fail.
const jiti = createJiti(import.meta.url);
const { buildSchema } = await jiti.import(path.join(repoRoot, 'src', 'deploy', 'schema-builder.ts'));
const schema = buildSchema();

const EXPECTED_KINDS = [
  'uptime-ssl',
  'redirect',
  'dotnet-health',
  'xpath',
  'xpath-spa',
  'gdpr',
  'launch-readiness',
  'custom-api',
  'restricted-admin',
];

describe('schema-content: top-level shape', () => {
  it('declares draft-07', () => {
    assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
  });

  it('has a versioned $id pinned to GitHub release-asset URL', () => {
    assert.match(
      schema.$id,
      /^https:\/\/github\.com\/[^/]+\/checkly-templates\/releases\/download\/v\d+\.\d+\.\d+\/schema\.json$/,
    );
  });

  it('embeds the package version in title (so editors show which version is loaded)', () => {
    assert.match(schema.title, /\(v\d+\.\d+\.\d+\)/);
  });

  it('disallows additional top-level properties', () => {
    assert.equal(schema.additionalProperties, false);
  });

  it('requires project and checks', () => {
    assert.deepEqual(schema.required.sort(), ['checks', 'project']);
  });
});

describe('schema-content: checks oneOf has one arm per kind', () => {
  const arms = schema.properties.checks.items.oneOf;

  it(`has exactly ${EXPECTED_KINDS.length} oneOf arms`, () => {
    assert.equal(arms.length, EXPECTED_KINDS.length);
  });

  it('each arm pins a known kind via { const }', () => {
    const armKinds = arms.map((a) => a.properties.kind.const).sort();
    assert.deepEqual(armKinds, [...EXPECTED_KINDS].sort());
  });
});

describe('schema-content: project block', () => {
  const project = schema.properties.project;

  it('logicalId pattern is kebab-case (lowercase alnum + hyphens, must start with alnum)', () => {
    assert.equal(project.properties.logicalId.pattern, '^[a-z0-9][a-z0-9-]*$');
  });

  it('defaults.frequency enum exposes every supported Checkly frequency', () => {
    const enumVals = project.properties.defaults.properties.frequency.enum;
    for (const name of ['EVERY_10S', 'EVERY_1M', 'EVERY_15M', 'EVERY_5M', 'EVERY_24H']) {
      assert.ok(enumVals.includes(name), `${name} missing from frequency enum`);
    }
  });

  it('codename is required when tagPrefix is set (via allOf+if/then)', () => {
    const constraint = project.allOf.find((c) => c.if?.required?.includes('tagPrefix'));
    assert.ok(constraint, 'expected tagPrefix-implies-codename constraint');
    assert.ok(constraint.then.required.includes('codename'));
  });
});

describe('schema-content: committed schema.json semantically matches generator output', () => {
  // Byte-identity is enforced separately by `node src/deploy/build-schema.mjs --check`
  // (run as a subprocess in cli.test.mjs and in CI). Here we assert that the
  // structural shape matches — i.e. the file isn't ahead of source or behind it
  // in any meaningful way that would change validation behaviour.
  it('deploy/schema.json $id matches the generator', () => {
    const onDisk = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'deploy', 'schema.json'), 'utf8'));
    assert.equal(onDisk.$id, schema.$id);
    assert.equal(onDisk.title, schema.title);
  });

  it('deploy/schema.json oneOf arm count matches source', () => {
    const onDisk = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'deploy', 'schema.json'), 'utf8'));
    assert.equal(onDisk.properties.checks.items.oneOf.length, schema.properties.checks.items.oneOf.length);
  });

  it('every kind in source appears in deploy/schema.json (and vice versa)', () => {
    const onDisk = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'deploy', 'schema.json'), 'utf8'));
    const diskKinds = onDisk.properties.checks.items.oneOf.map((a) => a.properties.kind.const).sort();
    const sourceKinds = schema.properties.checks.items.oneOf.map((a) => a.properties.kind.const).sort();
    assert.deepEqual(diskKinds, sourceKinds);
  });
});
