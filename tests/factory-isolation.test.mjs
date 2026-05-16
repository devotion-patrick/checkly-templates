// Isolation tests: do two calls into a factory contaminate each other?
//
// This protects against a subtle class of bug — a factory that mutates
// a shared preset / default / context object on first call and then
// reuses the mutation on subsequent calls. A consumer with many entries
// of the same kind would silently get wrong outputs after the first.
//
// All factories are called twice with deliberately different inputs;
// both outputs are then asserted to reflect only their own inputs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tryFactory, baseContext } from './helpers.mjs';

describe('gdpr factory: overrides are isolated between calls', () => {
  it('a previous call\'s `add` does not leak into the next call', () => {
    const a = tryFactory('gdpr', {
      kind: 'gdpr',
      logicalId: 'iso-gdpr-a',
      env: 'PROD',
      url: 'https://a.example.com',
      complianceMode: 'global',
      overrides: { trackingDomains: { add: ['leaked-from-a.example.com'] } },
      smoke: true,
      monitor: false,
    });
    const b = tryFactory('gdpr', {
      kind: 'gdpr',
      logicalId: 'iso-gdpr-b',
      env: 'PROD',
      url: 'https://b.example.com',
      complianceMode: 'global',
      smoke: true,
      monitor: false,
    });

    const paramsA = JSON.parse(a.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    const paramsB = JSON.parse(b.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);

    assert.ok(paramsA.trackingDomains.includes('leaked-from-a.example.com'), 'A should have its own add');
    assert.ok(
      !paramsB.trackingDomains.includes('leaked-from-a.example.com'),
      'B must NOT see A\'s overrides — factory mutated shared state',
    );
  });

  it('a previous call\'s `cookieBlocklist.remove` does not strip categories from the next call', () => {
    tryFactory('gdpr', {
      kind: 'gdpr',
      logicalId: 'iso-gdpr-rem-a',
      env: 'PROD',
      url: 'https://a.example.com',
      complianceMode: 'global',
      overrides: { cookieBlocklist: { remove: ['youtube'] } },
      smoke: true,
      monitor: false,
    });
    const b = tryFactory('gdpr', {
      kind: 'gdpr',
      logicalId: 'iso-gdpr-rem-b',
      env: 'PROD',
      url: 'https://b.example.com',
      complianceMode: 'global',
      smoke: true,
      monitor: false,
    });

    const paramsB = JSON.parse(b.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.ok(
      paramsB.cookieBlocklist.youtube,
      'B must still have the youtube category — A\'s `remove` leaked into the preset',
    );
  });

  it('two calls with the same input produce identical CHECK_PARAMS', () => {
    const make = () =>
      tryFactory('gdpr', {
        kind: 'gdpr',
        logicalId: 'iso-gdpr-id-' + Math.random().toString(36).slice(2, 8),
        env: 'PROD',
        url: 'https://example.com',
        complianceMode: 'targeted',
        smoke: true,
        monitor: false,
      });
    const p1 = JSON.parse(make().environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    const p2 = JSON.parse(make().environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.deepEqual(p1, p2);
  });
});

describe('context isolation', () => {
  it('mutating ctx.defaultLocations between calls does not stomp the first call\'s construct', () => {
    const ctx = { ...baseContext, defaultLocations: ['eu-central-1'] };
    const a = tryFactory(
      'uptime-ssl',
      {
        kind: 'uptime-ssl',
        logicalId: 'iso-loc-a',
        env: 'PROD',
        url: 'https://example.com',
        smoke: false,
        monitor: true,
      },
      ctx,
    );
    // Mutate ctx after the call. The first construct's locations should
    // still reflect what was passed at construction time.
    ctx.defaultLocations.push('us-east-1');
    assert.ok(!a.locations.includes('us-east-1'), 'first construct picked up later mutation');
  });

  it('factories with entry.locations do not mutate ctx.defaultLocations', () => {
    const ctx = { ...baseContext, defaultLocations: ['eu-central-1'] };
    const before = [...ctx.defaultLocations];
    tryFactory(
      'uptime-ssl',
      {
        kind: 'uptime-ssl',
        logicalId: 'iso-loc-b',
        env: 'PROD',
        url: 'https://example.com',
        locations: ['ap-southeast-2'],
        smoke: false,
        monitor: true,
      },
      ctx,
    );
    assert.deepEqual(ctx.defaultLocations, before, 'factory mutated ctx.defaultLocations');
  });
});

describe('all six kinds together (one of each) instantiate without conflict', () => {
  it('every kind\'s factory produces a unique logicalId-keyed construct', () => {
    const entries = [
      { kind: 'uptime-ssl', logicalId: 'mix-uptime', env: 'PROD', url: 'https://x.com', smoke: false, monitor: true },
      {
        kind: 'redirect',
        logicalId: 'mix-redirect',
        env: 'PROD',
        url: 'http://x.com',
        expectedLocation: 'https://x.com/',
        smoke: true,
        monitor: false,
      },
      { kind: 'dotnet-health', logicalId: 'mix-health', env: 'PROD', url: 'https://x.com/health', smoke: true, monitor: true },
      {
        kind: 'xpath',
        logicalId: 'mix-xpath',
        env: 'PROD',
        url: 'https://x.com',
        expect: { contains: ['x'] },
        smoke: true,
        monitor: false,
      },
      {
        kind: 'xpath-spa',
        logicalId: 'mix-xpath-spa',
        env: 'PROD',
        url: 'https://x.com',
        expect: [{ selector: 'h1', contains: 'x' }],
        smoke: true,
        monitor: false,
      },
      {
        kind: 'gdpr',
        logicalId: 'mix-gdpr',
        env: 'PROD',
        url: 'https://x.com',
        complianceMode: 'targeted',
        smoke: true,
        monitor: false,
      },
    ];
    const constructs = entries.map((e) => tryFactory(e.kind, e));
    assert.equal(constructs.length, 6);
    const ids = new Set(constructs.map((c) => c.logicalId));
    assert.equal(ids.size, 6, 'logicalIds collided');
  });
});
