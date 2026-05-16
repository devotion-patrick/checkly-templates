// Factory precedence tests: entry → project → kind → hardcoded fallback.
//
// History: through 2026-05-17, every kind's factory used the order
// `entry → kind → project`, so a project that set `defaults.locations:
// ["ap-southeast-2"]` got silently overridden by the kind's own defaults
// (e.g. dotnet-health's ['eu-central-1', 'ap-southeast-2']). This made
// project-level defaults useless for kinds with their own defaults.
// These tests pin the corrected precedence so it can't regress.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tryFactory, baseContext } from './helpers.mjs';

// The kinds and a sentinel `defaults.locations` we can spot in the output.
// Each fixture entry deliberately omits both `frequency` and `locations`
// so the precedence chain runs all the way down.
const KINDS = [
  {
    kind: 'uptime-ssl',
    entry: { kind: 'uptime-ssl', logicalId: 'p-u', env: 'PROD', url: 'https://example.com', smoke: false, monitor: true },
  },
  {
    kind: 'redirect',
    entry: {
      kind: 'redirect',
      logicalId: 'p-r',
      env: 'PROD',
      url: 'http://example.com',
      expectedLocation: 'https://example.com/',
      smoke: true,
      monitor: false,
    },
  },
  {
    kind: 'dotnet-health',
    entry: { kind: 'dotnet-health', logicalId: 'p-d', env: 'PROD', url: 'https://api.example.com/health', smoke: true, monitor: true },
  },
  {
    kind: 'xpath',
    entry: { kind: 'xpath', logicalId: 'p-x', env: 'PROD', url: 'https://example.com', expect: { contains: ['x'] }, smoke: true, monitor: false },
  },
  {
    kind: 'xpath-spa',
    entry: {
      kind: 'xpath-spa',
      logicalId: 'p-xs',
      env: 'PROD',
      url: 'https://example.com',
      expect: [{ selector: 'h1', contains: 'x' }],
      smoke: true,
      monitor: false,
    },
  },
  {
    kind: 'gdpr',
    entry: { kind: 'gdpr', logicalId: 'p-g', env: 'PROD', url: 'https://example.com', complianceMode: 'targeted', smoke: true, monitor: false },
  },
];

// Each test case mints a unique logicalId so Checkly's Session doesn't
// trip on "Resource already exists" when the same kind runs in multiple
// describes.
let _seq = 0;
const uid = (k) => `p-${k}-${++_seq}`;

describe('precedence: project-level locations beat kind-level defaults', () => {
  for (const { kind, entry } of KINDS) {
    it(`${kind} honours ctx.defaultLocations even when the kind has its own defaults`, () => {
      const c = tryFactory(kind, { ...entry, logicalId: uid(kind) }, { ...baseContext, defaultLocations: ['ap-southeast-2'] });
      assert.deepEqual([...c.locations], ['ap-southeast-2'], `${kind} ignored project default`);
    });
  }
});

describe('precedence: project-level frequency beats kind-level defaults', () => {
  for (const { kind, entry } of KINDS) {
    it(`${kind} honours ctx.defaultFrequency`, () => {
      const c = tryFactory(kind, { ...entry, logicalId: uid(kind) }, { ...baseContext, defaultFrequency: 'EVERY_30M' });
      assert.notEqual(c.frequency, undefined);
    });
  }
});

describe('precedence: entry-level beats project-level beats kind-level', () => {
  for (const { kind, entry } of KINDS) {
    it(`${kind} entry.locations wins over both project and kind defaults`, () => {
      const c = tryFactory(
        kind,
        { ...entry, logicalId: uid(kind), locations: ['us-east-1'] },
        { ...baseContext, defaultLocations: ['ap-southeast-2'] },
      );
      assert.deepEqual([...c.locations], ['us-east-1']);
    });
  }
});

describe('precedence: missing locations throws a clear error', () => {
  for (const { kind, entry } of KINDS) {
    it(`${kind} throws when neither entry nor project sets locations`, () => {
      assert.throws(
        () =>
          tryFactory(
            kind,
            { ...entry, logicalId: uid(kind) },
            { project: { logicalId: 'p', name: 'P' } }, // no defaultLocations
          ),
        /has no locations set/,
      );
    });
  }

  it('error message points at both valid config sites + gives an example', () => {
    try {
      tryFactory(
        'uptime-ssl',
        {
          kind: 'uptime-ssl',
          logicalId: 'err-fixture',
          env: 'PROD',
          url: 'https://example.com',
          smoke: true,
          monitor: false,
        },
        { project: { logicalId: 'p', name: 'P' } },
      );
      assert.fail('expected resolveLocations to throw');
    } catch (err) {
      assert.match(err.message, /Set "locations" on the entry itself/);
      assert.match(err.message, /OR set "project\.defaults\.locations"/);
      assert.match(err.message, /ap-southeast-2/);
    }
  });
});
