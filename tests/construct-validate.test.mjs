// Run Checkly's own Construct.validate() against each kind's factory
// output. This is the layer of validation Checkly's backend uses to
// accept or reject a construct; failing it locally would otherwise only
// surface as a confused error from `checkly test` or `checkly deploy`.
//
// We can't catch every reason Checkly's API might reject a request
// (auth, quotas, region availability all happen server-side), but every
// shape-of-payload bug we can detect without network lives here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tryFactory, repoRoot } from './helpers.mjs';

// `checkly`'s package exports lock down construct-diagnostics, so we
// load it via its on-disk path directly. Same shape regardless of how
// it was reached.
const { ConstructDiagnostics } = await import(
  pathToFileURL(
    path.join(repoRoot, 'node_modules', 'checkly', 'dist', 'constructs', 'construct-diagnostics.js'),
  ).href
);

async function validateConstruct(construct) {
  const diag = new ConstructDiagnostics(construct);
  await construct.validate(diag);
  return {
    isFatal: diag.isFatal(),
    isBenign: diag.isBenign(),
    observations: diag.observations,
  };
}

const KINDS = [
  {
    kind: 'uptime-ssl',
    entry: {
      kind: 'uptime-ssl',
      logicalId: 'cv-uptime',
      env: 'PROD',
      url: 'https://example.com',
      smoke: false,
      monitor: true,
    },
  },
  {
    kind: 'redirect',
    entry: {
      kind: 'redirect',
      logicalId: 'cv-redirect',
      env: 'PROD',
      url: 'http://example.com',
      expectedLocation: 'https://example.com/',
      smoke: true,
      monitor: false,
    },
  },
  {
    kind: 'dotnet-health',
    entry: {
      kind: 'dotnet-health',
      logicalId: 'cv-health',
      env: 'PROD',
      url: 'https://api.example.com/health',
      smoke: true,
      monitor: true,
    },
  },
  {
    kind: 'xpath',
    entry: {
      kind: 'xpath',
      logicalId: 'cv-xpath',
      env: 'PROD',
      url: 'https://example.com',
      expect: { contains: ['Example'] },
      smoke: true,
      monitor: false,
    },
  },
  {
    kind: 'xpath-spa',
    entry: {
      kind: 'xpath-spa',
      logicalId: 'cv-xpath-spa',
      env: 'PROD',
      url: 'https://example.com',
      expect: [{ selector: 'h1', contains: 'Example' }],
      smoke: true,
      monitor: false,
    },
  },
  {
    kind: 'gdpr',
    entry: {
      kind: 'gdpr',
      logicalId: 'cv-gdpr',
      env: 'PROD',
      url: 'https://example.com',
      complianceMode: 'targeted',
      smoke: true,
      monitor: false,
    },
  },
  {
    kind: 'custom-api',
    entry: {
      kind: 'custom-api',
      logicalId: 'cv-custom-api',
      env: 'PROD',
      url: 'https://example.com/api/status',
      script: "if (response.statusCode !== 200) throw new Error('unexpected status ' + response.statusCode);",
      smoke: true,
      monitor: false,
    },
  },
  {
    kind: 'restricted-admin',
    entry: {
      kind: 'restricted-admin',
      logicalId: 'cv-restricted-admin',
      env: 'PROD',
      url: 'https://example.com/admin',
      expectedAccess: 'gated',
      smoke: true,
      monitor: false,
    },
  },
];

describe('Construct.validate(): every kind\'s factory output passes Checkly\'s own validators', () => {
  for (const { kind, entry } of KINDS) {
    it(`${kind} produces a construct Checkly does not flag fatally`, async () => {
      const c = tryFactory(kind, entry);
      const { isFatal, observations } = await validateConstruct(c);
      assert.equal(
        isFatal,
        false,
        `Checkly's validator flagged ${kind} fatally:\n` +
          observations
            .filter((o) => o.isFatal())
            .map((o) => `  - ${o.describe?.() ?? JSON.stringify(o, null, 2)}`)
            .join('\n'),
      );
    });
  }
});

describe('Construct.validate(): variants', () => {
  it('uptime-ssl with custom successStatusRange validates', async () => {
    const c = tryFactory('uptime-ssl', {
      kind: 'uptime-ssl',
      logicalId: 'cv-uptime-range',
      env: 'PROD',
      url: 'https://example.com',
      successStatusRange: { min: 200, max: 399 },
      smoke: false,
      monitor: true,
    });
    const { isFatal } = await validateConstruct(c);
    assert.equal(isFatal, false);
  });

  it('redirect with non-default expectedStatus validates', async () => {
    const c = tryFactory('redirect', {
      kind: 'redirect',
      logicalId: 'cv-redirect-308',
      env: 'PROD',
      url: 'http://example.com',
      expectedStatus: 308,
      expectedLocation: 'https://example.com/',
      smoke: true,
      monitor: false,
    });
    const { isFatal } = await validateConstruct(c);
    assert.equal(isFatal, false);
  });

  it('dotnet-health with multiple expectedComponents validates', async () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'cv-health-multi',
      env: 'PROD',
      url: 'https://api.example.com/health',
      expectedComponents: ['sql', 'redis', 'queue', 'external-api'],
      smoke: true,
      monitor: true,
    });
    const { isFatal } = await validateConstruct(c);
    assert.equal(isFatal, false);
  });

  it('gdpr with overrides validates', async () => {
    const c = tryFactory('gdpr', {
      kind: 'gdpr',
      logicalId: 'cv-gdpr-overrides',
      env: 'PROD',
      url: 'https://example.com',
      complianceMode: 'global',
      overrides: {
        trackingDomains: { add: ['custom.example.com'], remove: ['youtube.com'] },
        cookieBlocklist: { add: { vendor: ['_vendor_*'] } },
      },
      smoke: true,
      monitor: false,
    });
    const { isFatal } = await validateConstruct(c);
    assert.equal(isFatal, false);
  });
});
