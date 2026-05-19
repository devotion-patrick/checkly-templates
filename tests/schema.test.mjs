// Schema permutation tests. For every kind:
//   - the minimal valid entry passes
//   - each required common field, when missing, fails
//   - each per-kind required field, when missing, fails
//   - smoke=false + monitor=false fails (the at-least-one-true constraint)
//   - smoke and monitor each accepted on their own AND together
//   - additionalProperties: false catches unknown fields
//
// Plus project-level rules (logicalId pattern; codename required when tagPrefix set).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { baseProject, configWith, validateConfig } from './helpers.mjs';

const MINIMAL_BY_KIND = {
  'uptime-ssl': {
    kind: 'uptime-ssl',
    logicalId: 'min-uptime',
    env: 'PROD',
    url: 'https://example.com',
    smoke: true,
    monitor: false,
  },
  redirect: {
    kind: 'redirect',
    logicalId: 'min-redirect',
    env: 'PROD',
    url: 'https://example.com',
    expectedLocation: 'https://www.example.com/',
    smoke: true,
    monitor: false,
  },
  'dotnet-health': {
    kind: 'dotnet-health',
    logicalId: 'min-dotnet-health',
    env: 'PROD',
    url: 'https://example.com/health',
    smoke: true,
    monitor: false,
  },
  xpath: {
    kind: 'xpath',
    logicalId: 'min-xpath',
    env: 'PROD',
    url: 'https://example.com',
    expect: { contains: ['Example'] },
    smoke: true,
    monitor: false,
  },
  'xpath-spa': {
    kind: 'xpath-spa',
    logicalId: 'min-xpath-spa',
    env: 'PROD',
    url: 'https://example.com',
    expect: [{ selector: 'h1', contains: 'Example' }],
    smoke: true,
    monitor: false,
  },
  gdpr: {
    kind: 'gdpr',
    logicalId: 'min-gdpr',
    env: 'PROD',
    url: 'https://example.com',
    complianceMode: 'targeted',
    smoke: true,
    monitor: false,
  },
  'launch-readiness': {
    kind: 'launch-readiness',
    logicalId: 'min-launch-ready',
    env: 'PROD',
    url: 'https://example.com',
    checks: { favicon: true },
    smoke: true,
    monitor: false,
  },
};

const PER_KIND_REQUIRED = {
  'uptime-ssl': [],
  redirect: ['expectedLocation'],
  'dotnet-health': [],
  xpath: ['expect'],
  'xpath-spa': ['expect'],
  'launch-readiness': ['checks'],
  gdpr: ['complianceMode'],
};

// `env` is intentionally NOT in COMMON_REQUIRED at the schema level —
// entries may inherit it from `project.defaults.env`. load-config.ts
// enforces that a value is supplied at one of the two levels; that
// runtime check has its own coverage in tests/load-config.test.mjs.
const COMMON_REQUIRED = ['kind', 'logicalId', 'url'];

describe('schema: per-kind matrix', () => {
  for (const [kind, minimal] of Object.entries(MINIMAL_BY_KIND)) {
    describe(kind, () => {
      it('accepts a minimal valid entry', () => {
        const { valid, errors } = validateConfig(configWith(minimal));
        assert.equal(valid, true, JSON.stringify(errors, null, 2));
      });

      for (const field of COMMON_REQUIRED) {
        it(`rejects when common field "${field}" is missing`, () => {
          const entry = { ...minimal };
          delete entry[field];
          const { valid } = validateConfig(configWith(entry));
          assert.equal(valid, false, `expected rejection when ${field} is missing`);
        });
      }

      for (const field of PER_KIND_REQUIRED[kind]) {
        it(`rejects when per-kind required field "${field}" is missing`, () => {
          const entry = { ...minimal };
          delete entry[field];
          const { valid } = validateConfig(configWith(entry));
          assert.equal(valid, false, `expected rejection when ${field} is missing`);
        });
      }

      it('rejects when both smoke and monitor are false', () => {
        const entry = { ...minimal, smoke: false, monitor: false };
        const { valid } = validateConfig(configWith(entry));
        assert.equal(valid, false);
      });

      it('rejects when both smoke and monitor are absent', () => {
        const entry = { ...minimal };
        delete entry.smoke;
        delete entry.monitor;
        const { valid } = validateConfig(configWith(entry));
        assert.equal(valid, false);
      });

      it('accepts smoke=true alone', () => {
        const entry = { ...minimal, smoke: true, monitor: false };
        const { valid, errors } = validateConfig(configWith(entry));
        assert.equal(valid, true, JSON.stringify(errors));
      });

      it('accepts monitor=true alone', () => {
        const entry = { ...minimal, smoke: false, monitor: true };
        const { valid, errors } = validateConfig(configWith(entry));
        assert.equal(valid, true, JSON.stringify(errors));
      });

      it('accepts smoke=true + monitor=true', () => {
        const entry = { ...minimal, smoke: true, monitor: true };
        const { valid, errors } = validateConfig(configWith(entry));
        assert.equal(valid, true, JSON.stringify(errors));
      });

      it('rejects unknown additional properties', () => {
        const entry = { ...minimal, unknownField: 'nope' };
        const { valid } = validateConfig(configWith(entry));
        assert.equal(valid, false);
      });

      it('rejects logicalId with invalid characters', () => {
        const entry = { ...minimal, logicalId: 'Has_Caps_And_Underscores' };
        const { valid } = validateConfig(configWith(entry));
        assert.equal(valid, false);
      });

      it('rejects url that is not a uri', () => {
        const entry = { ...minimal, url: 'not a url' };
        const { valid } = validateConfig(configWith(entry));
        assert.equal(valid, false);
      });

      it('rejects unknown kind discriminator', () => {
        const entry = { ...minimal, kind: 'made-up-kind' };
        const { valid } = validateConfig(configWith(entry));
        assert.equal(valid, false);
      });
    });
  }
});

describe('schema: dotnet-health headers', () => {
  const minimal = MINIMAL_BY_KIND['dotnet-health'];

  it('accepts header items with `value`', () => {
    const entry = {
      ...minimal,
      headers: [{ key: 'X-Tenant', value: 'acme' }],
    };
    const { valid, errors } = validateConfig(configWith(entry));
    assert.equal(valid, true, JSON.stringify(errors));
  });

  it('accepts header items with `valueFromEnv`', () => {
    const entry = {
      ...minimal,
      headers: [{ key: 'X-Health-Key', valueFromEnv: 'HEALTH_KEY' }],
    };
    const { valid, errors } = validateConfig(configWith(entry));
    assert.equal(valid, true, JSON.stringify(errors));
  });

  it('rejects header items with both `value` and `valueFromEnv` set', () => {
    const entry = {
      ...minimal,
      headers: [{ key: 'X-Health-Key', value: 'literal', valueFromEnv: 'HEALTH_KEY' }],
    };
    const { valid } = validateConfig(configWith(entry));
    assert.equal(valid, false);
  });

  it('rejects header items with neither `value` nor `valueFromEnv` set', () => {
    const entry = {
      ...minimal,
      headers: [{ key: 'X-Health-Key' }],
    };
    const { valid } = validateConfig(configWith(entry));
    assert.equal(valid, false);
  });

  it('rejects header items missing key', () => {
    const entry = {
      ...minimal,
      headers: [{ value: 'something' }],
    };
    const { valid } = validateConfig(configWith(entry));
    assert.equal(valid, false);
  });

  it('rejects header items with additional properties', () => {
    const entry = {
      ...minimal,
      headers: [{ key: 'X-Health-Key', value: 'x', secret: true }],
    };
    const { valid } = validateConfig(configWith(entry));
    assert.equal(valid, false);
  });
});

describe('schema: project block', () => {
  it('requires logicalId', () => {
    const { valid } = validateConfig({ project: { name: 'X' }, checks: [MINIMAL_BY_KIND['uptime-ssl']] });
    assert.equal(valid, false);
  });

  it('requires name', () => {
    const { valid } = validateConfig({ project: { logicalId: 'x' }, checks: [MINIMAL_BY_KIND['uptime-ssl']] });
    assert.equal(valid, false);
  });

  it('requires codename when tagPrefix is set', () => {
    const { valid } = validateConfig({
      project: { ...baseProject, tagPrefix: 'acme' },
      checks: [MINIMAL_BY_KIND['uptime-ssl']],
    });
    assert.equal(valid, false);
  });

  it('accepts tagPrefix when codename is set', () => {
    const { valid, errors } = validateConfig({
      project: { ...baseProject, tagPrefix: 'acme', codename: 'acme' },
      checks: [MINIMAL_BY_KIND['uptime-ssl']],
    });
    assert.equal(valid, true, JSON.stringify(errors));
  });

  it('accepts an empty tagPrefix without codename (no prefix mode)', () => {
    const { valid, errors } = validateConfig({
      project: baseProject,
      checks: [MINIMAL_BY_KIND['uptime-ssl']],
    });
    assert.equal(valid, true, JSON.stringify(errors));
  });

  it('rejects checks array of length 0', () => {
    const { valid } = validateConfig({ project: baseProject, checks: [] });
    assert.equal(valid, false);
  });

  it('rejects unknown frequency name in defaults', () => {
    const { valid } = validateConfig({
      project: { ...baseProject, defaults: { frequency: 'EVERY_500S' } },
      checks: [MINIMAL_BY_KIND['uptime-ssl']],
    });
    assert.equal(valid, false);
  });
});
