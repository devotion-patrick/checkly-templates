// manifest.json is what a consumer that deploys checks itself reads instead
// of restating each kind's facts in its own code. The Client Portal talks to
// Checkly's REST API directly and cannot run these factories, so it kept C#
// copies of every kind's version, default frequency and checkType. They
// drifted: xpath ran at EVERY_15M against the template's EVERY_30M (double
// the spend), and four kinds deployed as the wrong construct entirely.
//
// Two things have to hold for the manifest to be worth reading. It must be
// in step with the modules (the --check mode CI runs covers staleness), and
// the checkType each module *declares* must be the checkType its factory
// actually produces -- a declaration nothing verifies is just a second place
// to be wrong.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MODULES, REGISTRY, constructsOf, repoRoot, tryFactory } from './helpers.mjs';

const manifest = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'src/deploy/manifest.json'), 'utf8'),
);

// Minimal valid entry per kind, same shape factory.test.mjs uses.
const ENTRY_EXTRAS = {
  'uptime-ssl': {},
  redirect: { expectedLocation: 'https://example.com/' },
  'dotnet-health': {},
  xpath: { expect: { contains: ['x'] } },
  'xpath-spa': { expect: [{ selector: 'h1', contains: 'x' }] },
  gdpr: { complianceMode: 'targeted' },
  'launch-readiness': {},
  'custom-api': { script: 'if (response.statusCode >= 500) throw new Error("down");' },
  'restricted-admin': { expectedAccess: 'gated' },
  'custom-playwright': { script: 'true;' },
  'custom-multistep': { script: 'true;' },
  'security-headers': {},
};

describe('manifest: agrees with the registry', () => {
  it('lists exactly the registered kinds', () => {
    assert.deepEqual(
      Object.keys(manifest.kinds).sort(),
      MODULES.map((m) => m.kind).sort(),
    );
  });

  for (const module of MODULES) {
    it(`${module.kind}: version, checkType, isPlaywright and defaults match the module`, () => {
      const entry = manifest.kinds[module.kind];
      assert.equal(entry.version, module.version);
      assert.equal(entry.checkType, module.checkType);
      assert.equal(entry.isPlaywright, module.isPlaywright === true);
      assert.equal(entry.defaults.frequency, module.defaults.frequency);
    });
  }
});

describe('manifest: declared checkType is the one the factory produces', () => {
  for (const kind of Object.keys(ENTRY_EXTRAS)) {
    it(`${kind}: synthesize() emits the declared checkType`, () => {
      const [construct] = constructsOf(tryFactory(kind, {
        kind,
        logicalId: `manifest-${kind}`,
        env: 'PROD',
        url: 'https://example.com',
        smoke: true,
        monitor: false,
        ...ENTRY_EXTRAS[kind],
      }));

      assert.equal(construct.synthesize().checkType, REGISTRY[kind].checkType);
    });
  }
});
