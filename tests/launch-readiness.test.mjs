// launch-readiness specifics. The schema-level "minimal valid entry"
// case is covered by the per-kind matrix in schema.test.mjs; here we
// drill into the rich `checks` object — every togglable assertion has
// a boolean-OR-options shape, plus a few list-of-strings, plus the
// trailingSlashRedirect enum. One regression in any of those rejects
// real consumer configs (or, worse, silently accepts bad ones).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { baseProject, configWith, tryFactory, validateConfig } from './helpers.mjs';

const minimal = (extra = {}) => ({
  kind: 'launch-readiness',
  logicalId: 'lr-test-' + Math.random().toString(36).slice(2, 8),
  env: 'PROD',
  url: 'https://example.com',
  checks: { favicon: true, ...extra.checks },
  smoke: true,
  monitor: false,
  ...extra,
  ...(extra.checks ? {} : {}),
});

function v(entry) {
  return validateConfig(configWith(entry));
}

describe('launch-readiness schema: at least one check must be enabled', () => {
  it('rejects an empty checks object', () => {
    const entry = { ...minimal(), checks: {} };
    const { valid } = v(entry);
    assert.equal(valid, false);
  });

  it('rejects checks with unknown keys', () => {
    const entry = { ...minimal(), checks: { somethingMadeUp: true } };
    const { valid } = v(entry);
    assert.equal(valid, false);
  });
});

describe('launch-readiness schema: boolean-OR-options checks', () => {
  const BOOL_OR_OBJ_CHECKS = [
    { key: 'placeholderText', opts: { patterns: ['lorem ipsum', 'TBD'] } },
    { key: 'canonical', opts: { expectedUrl: 'https://example.com/' } },
    { key: 'h1', opts: { count: 2 } },
    { key: 'imgAlt', opts: { allowEmptyForDecorative: false } },
    { key: 'metaTitle', opts: { minLength: 30, maxLength: 65 } },
    { key: 'metaDescription', opts: { minLength: 70, maxLength: 160 } },
    { key: 'sitemap', opts: { path: '/sitemap_index.xml', spotCheckUrls: 5 } },
    { key: 'notFoundPage', opts: { probe: '/launch-readiness-probe' } },
  ];

  for (const { key, opts } of BOOL_OR_OBJ_CHECKS) {
    describe(key, () => {
      it('accepts boolean true', () => {
        const { valid, errors } = v({ ...minimal(), checks: { [key]: true } });
        assert.equal(valid, true, JSON.stringify(errors));
      });

      it('accepts an options object', () => {
        const { valid, errors } = v({ ...minimal(), checks: { [key]: opts } });
        assert.equal(valid, true, JSON.stringify(errors));
      });

      it('rejects an unknown property inside options', () => {
        const { valid } = v({ ...minimal(), checks: { [key]: { ...opts, unknown: 'no' } } });
        assert.equal(valid, false);
      });
    });
  }
});

describe('launch-readiness schema: list-of-strings checks', () => {
  it('ogTags accepts a non-empty list of og:* names', () => {
    const { valid, errors } = v({
      ...minimal(),
      checks: { ogTags: ['og:title', 'og:description', 'og:image', 'og:url'] },
    });
    assert.equal(valid, true, JSON.stringify(errors));
  });

  it('ogTags rejects entries not starting with og:', () => {
    const { valid } = v({ ...minimal(), checks: { ogTags: ['title'] } });
    assert.equal(valid, false);
  });

  it('ogTags rejects an empty list', () => {
    const { valid } = v({ ...minimal(), checks: { ogTags: [] } });
    assert.equal(valid, false);
  });

  it('securityHeaders accepts a non-empty list of header names', () => {
    const { valid, errors } = v({
      ...minimal(),
      checks: { securityHeaders: ['X-Frame-Options', 'Strict-Transport-Security'] },
    });
    assert.equal(valid, true, JSON.stringify(errors));
  });

  it('securityHeaders rejects an empty list', () => {
    const { valid } = v({ ...minimal(), checks: { securityHeaders: [] } });
    assert.equal(valid, false);
  });

  it('expectedScripts accepts a non-empty list', () => {
    const { valid, errors } = v({
      ...minimal(),
      checks: { expectedScripts: ['googletagmanager.com/gtm.js'] },
    });
    assert.equal(valid, true, JSON.stringify(errors));
  });
});

describe('launch-readiness schema: enum / boolean checks', () => {
  it('trailingSlashRedirect accepts "drop"', () => {
    const { valid, errors } = v({ ...minimal(), checks: { trailingSlashRedirect: 'drop' } });
    assert.equal(valid, true, JSON.stringify(errors));
  });

  it('trailingSlashRedirect accepts "add"', () => {
    const { valid, errors } = v({ ...minimal(), checks: { trailingSlashRedirect: 'add' } });
    assert.equal(valid, true, JSON.stringify(errors));
  });

  it('trailingSlashRedirect rejects other values', () => {
    const { valid } = v({ ...minimal(), checks: { trailingSlashRedirect: 'always' } });
    assert.equal(valid, false);
  });

  for (const key of ['favicon', 'headingOrder', 'robotsTxt', 'recaptchaOnForms', 'lowercaseUrls', 'httpsRedirect']) {
    it(`${key} accepts boolean`, () => {
      const { valid, errors } = v({ ...minimal(), checks: { [key]: true } });
      assert.equal(valid, true, JSON.stringify(errors));
    });
  }

  for (const key of ['followJsRedirect', 'expectPubliclyAccessible']) {
    it(`${key} accepts boolean at the entry level`, () => {
      const { valid, errors } = v({ ...minimal(), [key]: false });
      assert.equal(valid, true, JSON.stringify(errors));
    });
  }

  it('expectPubliclyAccessible accepts "either"', () => {
    const { valid, errors } = v({ ...minimal(), expectPubliclyAccessible: 'either' });
    assert.equal(valid, true, JSON.stringify(errors));
  });

  it('expectPubliclyAccessible rejects other strings', () => {
    const { valid } = v({ ...minimal(), expectPubliclyAccessible: 'maybe' });
    assert.equal(valid, false);
  });
});

describe('launch-readiness factory: CHECK_PARAMS contract', () => {
  it('serialises checks + waitUntil into CHECK_PARAMS', () => {
    const ctx = { project: baseProject, defaultLocations: ['eu-central-1'] };
    const c = tryFactory(
      'launch-readiness',
      {
        kind: 'launch-readiness',
        logicalId: 'lr-factory',
        env: 'PROD',
        url: 'https://example.com',
        checks: { favicon: true, h1: { count: 2 }, ogTags: ['og:title'] },
        smoke: true,
        monitor: false,
      },
      ctx,
    );
    const env = Object.fromEntries(c.environmentVariables.map((v) => [v.key, v.value]));
    assert.equal(env.CHECK_KIND, 'launch-readiness');
    assert.equal(env.CHECK_TARGET_URL, 'https://example.com');
    const params = JSON.parse(env.CHECK_PARAMS);
    assert.equal(params.waitUntil, 'domcontentloaded');
    assert.deepEqual(params.checks.favicon, true);
    assert.deepEqual(params.checks.h1, { count: 2 });
    assert.deepEqual(params.checks.ogTags, ['og:title']);
  });

  it('honours waitUntil override', () => {
    const ctx = { project: baseProject, defaultLocations: ['eu-central-1'] };
    const c = tryFactory(
      'launch-readiness',
      {
        kind: 'launch-readiness',
        logicalId: 'lr-waitfor',
        env: 'PROD',
        url: 'https://example.com',
        waitUntil: 'networkidle',
        checks: { favicon: true },
        smoke: true,
        monitor: false,
      },
      ctx,
    );
    const params = JSON.parse(c.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.equal(params.waitUntil, 'networkidle');
  });

  it('defaults expectPubliclyAccessible to true', () => {
    const ctx = { project: baseProject, defaultLocations: ['eu-central-1'] };
    const c = tryFactory(
      'launch-readiness',
      {
        kind: 'launch-readiness',
        logicalId: 'lr-public-default',
        env: 'PROD',
        url: 'https://example.com',
        checks: { favicon: true },
        smoke: true,
        monitor: false,
      },
      ctx,
    );
    const params = JSON.parse(c.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.equal(params.expectPubliclyAccessible, true);
  });

  it('honours expectPubliclyAccessible: false override', () => {
    const ctx = { project: baseProject, defaultLocations: ['eu-central-1'] };
    const c = tryFactory(
      'launch-readiness',
      {
        kind: 'launch-readiness',
        logicalId: 'lr-public-false',
        env: 'PROD',
        url: 'https://example.com/admin',
        expectPubliclyAccessible: false,
        checks: { favicon: true },
        smoke: true,
        monitor: false,
      },
      ctx,
    );
    const params = JSON.parse(c.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.equal(params.expectPubliclyAccessible, false);
  });

  it('honours expectPubliclyAccessible: "either" override', () => {
    const ctx = { project: baseProject, defaultLocations: ['eu-central-1'] };
    const c = tryFactory(
      'launch-readiness',
      {
        kind: 'launch-readiness',
        logicalId: 'lr-public-either',
        env: 'PROD',
        url: 'https://example.com/admin',
        expectPubliclyAccessible: 'either',
        checks: { securityHeaders: ['Strict-Transport-Security'] },
        smoke: true,
        monitor: false,
      },
      ctx,
    );
    const params = JSON.parse(c.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.equal(params.expectPubliclyAccessible, 'either');
  });
});
