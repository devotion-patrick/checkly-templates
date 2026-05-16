// Construct.synthesize() output per kind. `synthesize()` is the moment
// a construct turns into the JSON payload Checkly's backend receives.
// Asserting on construct properties directly (as factory.test.mjs does)
// is good but doesn't cover the marshalling step; if Checkly ever
// renames a field, factory.test.mjs would pass and synthesize would fail.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tryFactory } from './helpers.mjs';

describe('synthesize: ApiCheck kinds', () => {
  it('uptime-ssl synthesises with method=GET, the configured url, and at least two assertions', () => {
    const c = tryFactory('uptime-ssl', {
      kind: 'uptime-ssl',
      logicalId: 'syn-uptime',
      env: 'PROD',
      url: 'https://example.com',
      smoke: false,
      monitor: true,
    });
    const out = c.synthesize();
    assert.equal(out.checkType, 'API');
    assert.equal(out.request.method, 'GET');
    assert.equal(out.request.url, 'https://example.com');
    assert.ok(Array.isArray(out.request.assertions) && out.request.assertions.length >= 2);
  });

  it('redirect synthesises with followRedirects=false', () => {
    const c = tryFactory('redirect', {
      kind: 'redirect',
      logicalId: 'syn-redirect',
      env: 'PROD',
      url: 'http://example.com',
      expectedLocation: 'https://www.example.com/',
      smoke: true,
      monitor: false,
    });
    const out = c.synthesize();
    assert.equal(out.request.followRedirects, false);
  });

  it('dotnet-health synthesises with Accept: application/json header', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'syn-health',
      env: 'PROD',
      url: 'https://api.example.com/health',
      smoke: true,
      monitor: false,
    });
    const out = c.synthesize();
    const acceptHeader = out.request.headers?.find((h) => h.key.toLowerCase() === 'accept');
    assert.ok(acceptHeader, 'expected Accept header');
    assert.equal(acceptHeader.value, 'application/json');
  });

  it('xpath synthesises the consumer-provided url verbatim', () => {
    const c = tryFactory('xpath', {
      kind: 'xpath',
      logicalId: 'syn-xpath',
      env: 'PROD',
      url: 'https://example.com/some/page',
      expect: { contains: ['x'] },
      smoke: true,
      monitor: false,
    });
    const out = c.synthesize();
    assert.equal(out.request.url, 'https://example.com/some/page');
  });
});

describe('synthesize: PlaywrightCheck kinds carry the env-var contract', () => {
  it('xpath-spa env vars survive synthesize', () => {
    const c = tryFactory('xpath-spa', {
      kind: 'xpath-spa',
      logicalId: 'syn-xs',
      env: 'PROD',
      url: 'https://app.example.com',
      expect: [{ selector: 'main', count: 1 }],
      smoke: true,
      monitor: false,
    });
    const out = c.synthesize();
    const env = Object.fromEntries(out.environmentVariables.map((v) => [v.key, v.value]));
    assert.equal(env.CHECK_KIND, 'xpath-spa');
    assert.equal(env.CHECK_TARGET_URL, 'https://app.example.com');
    assert.equal(typeof env.CHECK_PARAMS, 'string');
    const params = JSON.parse(env.CHECK_PARAMS);
    assert.equal(params.waitUntil, 'domcontentloaded');
    assert.deepEqual(params.selectors, [{ selector: 'main', count: 1 }]);
  });

  it('gdpr env vars survive synthesize', () => {
    const c = tryFactory('gdpr', {
      kind: 'gdpr',
      logicalId: 'syn-gdpr',
      env: 'PROD',
      url: 'https://www.example.com',
      complianceMode: 'targeted',
      smoke: true,
      monitor: false,
    });
    const out = c.synthesize();
    const env = Object.fromEntries(out.environmentVariables.map((v) => [v.key, v.value]));
    assert.equal(env.CHECK_KIND, 'gdpr');
    assert.equal(env.CHECK_TARGET_URL, 'https://www.example.com');
    const params = JSON.parse(env.CHECK_PARAMS);
    assert.equal(params.complianceMode, 'targeted');
    assert.ok(Array.isArray(params.trackingDomains));
  });
});

describe('synthesize: common fields', () => {
  it('frequency is set, not omitted', () => {
    const c = tryFactory('uptime-ssl', {
      kind: 'uptime-ssl',
      logicalId: 'syn-freq',
      env: 'PROD',
      url: 'https://example.com',
      frequency: 'EVERY_5M',
      smoke: false,
      monitor: true,
    });
    const out = c.synthesize();
    assert.notEqual(out.frequency, undefined);
  });

  it('tags array surfaces in synthesize output', () => {
    const c = tryFactory('uptime-ssl', {
      kind: 'uptime-ssl',
      logicalId: 'syn-tags',
      env: 'PROD',
      url: 'https://example.com',
      tags: ['team:platform'],
      smoke: true,
      monitor: false,
    });
    const out = c.synthesize();
    assert.ok(out.tags.includes('team:platform'));
    assert.ok(out.tags.includes('source:checkly-templates'));
  });

  it('activated defaults to true when consumer omits it', () => {
    const c = tryFactory('uptime-ssl', {
      kind: 'uptime-ssl',
      logicalId: 'syn-act',
      env: 'PROD',
      url: 'https://example.com',
      smoke: false,
      monitor: true,
    });
    const out = c.synthesize();
    assert.equal(out.activated, true);
  });

  it('activated: false propagates', () => {
    const c = tryFactory('uptime-ssl', {
      kind: 'uptime-ssl',
      logicalId: 'syn-act-false',
      env: 'PROD',
      url: 'https://example.com',
      activated: false,
      smoke: false,
      monitor: true,
    });
    const out = c.synthesize();
    assert.equal(out.activated, false);
  });
});
