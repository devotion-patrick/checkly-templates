// Registry contract. The registry is what bridges a string kind in the
// consumer config to a factory; a regression here breaks every consumer
// of an affected kind.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, REGISTRY, hasPlaywrightKinds } from './helpers.mjs';

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

describe('registry: shape', () => {
  it(`exposes exactly ${EXPECTED_KINDS.length} built-in kinds`, () => {
    assert.equal(MODULES.length, EXPECTED_KINDS.length);
    const kinds = MODULES.map((m) => m.kind).sort();
    assert.deepEqual(kinds, [...EXPECTED_KINDS].sort());
  });

  it('every module exposes kind, version, schemaFragment, defaults, factory', () => {
    for (const m of MODULES) {
      assert.equal(typeof m.kind, 'string', `${m.kind} missing kind string`);
      assert.equal(typeof m.version, 'string', `${m.kind} missing version string`);
      assert.ok(m.version.length > 0, `${m.kind} has an empty version`);
      assert.equal(typeof m.schemaFragment, 'object', `${m.kind} missing schemaFragment object`);
      assert.equal(typeof m.defaults, 'object', `${m.kind} missing defaults`);
      assert.equal(typeof m.factory, 'function', `${m.kind} missing factory function`);
    }
  });

  it('isPlaywright is set on the four Playwright kinds and nothing else', () => {
    const pw = MODULES.filter((m) => m.isPlaywright === true).map((m) => m.kind).sort();
    assert.deepEqual(pw, ['gdpr', 'launch-readiness', 'restricted-admin', 'xpath-spa']);
  });

  it('REGISTRY is keyed by `kind`', () => {
    for (const m of MODULES) {
      assert.strictEqual(REGISTRY[m.kind], m);
    }
  });

  it('REGISTRY is frozen (resistant to accidental mutation)', () => {
    assert.ok(Object.isFrozen(REGISTRY));
  });

  it('every module is unique by kind', () => {
    const seen = new Set();
    for (const m of MODULES) {
      assert.ok(!seen.has(m.kind), `duplicate kind: ${m.kind}`);
      seen.add(m.kind);
    }
  });
});

describe('registry: schema fragments', () => {
  it('each schema fragment pins `kind: { const: <kind> }`', () => {
    for (const m of MODULES) {
      assert.deepEqual(m.schemaFragment.properties.kind, { const: m.kind });
    }
  });

  it('each schema fragment carries the smoke/monitor allOf constraint', () => {
    for (const m of MODULES) {
      assert.ok(Array.isArray(m.schemaFragment.allOf), `${m.kind} missing allOf`);
      const hasConstraint = m.schemaFragment.allOf.some((c) =>
        Array.isArray(c.anyOf) && c.anyOf.some((a) => a.required?.includes('smoke')),
      );
      assert.ok(hasConstraint, `${m.kind} missing smoke/monitor constraint`);
    }
  });

  it('each schema fragment is additionalProperties: false', () => {
    for (const m of MODULES) {
      assert.equal(m.schemaFragment.additionalProperties, false, `${m.kind} allows additional properties`);
    }
  });

  it('each schema fragment lists kind/logicalId/url in required (env is resolved at load-config)', () => {
    for (const m of MODULES) {
      for (const f of ['kind', 'logicalId', 'url']) {
        assert.ok(m.schemaFragment.required.includes(f), `${m.kind} doesn't require ${f}`);
      }
      // env is intentionally NOT schema-required — load-config resolves
      // it from `project.defaults.env` when the entry omits it.
      assert.ok(
        !m.schemaFragment.required.includes('env'),
        `${m.kind} requires env at the schema level but should let load-config resolve it`,
      );
    }
  });
});

describe('hasPlaywrightKinds', () => {
  it('returns true for any list containing gdpr', () => {
    assert.equal(hasPlaywrightKinds(['uptime-ssl', 'gdpr', 'xpath']), true);
  });

  it('returns true for any list containing xpath-spa', () => {
    assert.equal(hasPlaywrightKinds(['xpath-spa']), true);
  });

  it('returns false for an ApiCheck-only list', () => {
    assert.equal(hasPlaywrightKinds(['uptime-ssl', 'redirect', 'dotnet-health', 'xpath']), false);
  });

  it('returns false for an empty list', () => {
    assert.equal(hasPlaywrightKinds([]), false);
  });

  it('returns false (does not throw) for unknown kinds', () => {
    assert.equal(hasPlaywrightKinds(['made-up']), false);
  });
});
