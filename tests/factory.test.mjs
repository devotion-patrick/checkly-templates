// Per-kind factory output tests. The factory takes (entry, ctx) and
// returns a Checkly construct (ApiCheck or PlaywrightCheck). We assert
// on the construct's observable properties — specifically URL, name,
// tags, and per-kind synthesis — so a future refactor that silently
// breaks any of these falls into a red test instead of a customer
// pipeline.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tryFactory, baseContext } from './helpers.mjs';

const ctx = baseContext;

describe('uptime-ssl factory', () => {
  it('uses url as request.url verbatim', () => {
    const c = tryFactory('uptime-ssl', {
      kind: 'uptime-ssl',
      logicalId: 'u1',
      env: 'PROD',
      url: 'https://example.com',
      smoke: false,
      monitor: true,
    });
    assert.equal(c.request.url, 'https://example.com');
  });

  it('emits a status-range assertion (default 200-299 inclusive)', () => {
    const c = tryFactory('uptime-ssl', {
      kind: 'uptime-ssl',
      logicalId: 'u2',
      env: 'PROD',
      url: 'https://example.com',
      smoke: false,
      monitor: true,
    });
    assert.equal(c.request.assertions.length, 2);
  });

  it('emits source tag and prefix triple when project has prefix+codename', () => {
    const c = tryFactory(
      'uptime-ssl',
      {
        kind: 'uptime-ssl',
        logicalId: 'u3',
        env: 'PROD',
        url: 'https://example.com',
        smoke: false,
        monitor: true,
      },
      { ...ctx, project: { ...ctx.project, tagPrefix: 'acme', codename: 'acme-site' } },
    );
    assert.ok(c.tags.includes('acme.source:checkly-templates'), `tags: ${c.tags.join(', ')}`);
    assert.ok(c.tags.includes('acme.app:acme-site'));
    assert.ok(c.tags.includes('acme.env:PROD'));
    assert.ok(c.tags.includes('acme.kind:uptime-ssl'));
  });

  it('emits bare source tag when no prefix configured', () => {
    const c = tryFactory('uptime-ssl', {
      kind: 'uptime-ssl',
      logicalId: 'u4',
      env: 'PROD',
      url: 'https://example.com',
      smoke: false,
      monitor: true,
    });
    assert.ok(c.tags.includes('source:checkly-templates'));
  });
});

describe('redirect factory', () => {
  it('forces followRedirects=false', () => {
    const c = tryFactory('redirect', {
      kind: 'redirect',
      logicalId: 'r1',
      env: 'PROD',
      url: 'http://example.com',
      expectedLocation: 'https://www.example.com/',
      smoke: true,
      monitor: false,
    });
    assert.equal(c.request.followRedirects, false);
  });

  it('uses default expectedStatus=301 when unset', () => {
    const c = tryFactory('redirect', {
      kind: 'redirect',
      logicalId: 'r2',
      env: 'PROD',
      url: 'http://example.com',
      expectedLocation: 'https://www.example.com/',
      smoke: true,
      monitor: false,
    });
    // First assertion is statusCode().equals(301); second is the Location header.
    assert.equal(c.request.assertions.length, 2);
  });
});

describe('dotnet-health factory: URL composition', () => {
  it('uses url as-is when healthPath is unset', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'd1',
      env: 'PROD',
      url: 'https://api.example.com/healthz/ready',
      smoke: true,
      monitor: false,
    });
    assert.equal(c.request.url, 'https://api.example.com/healthz/ready');
  });

  it('appends healthPath when set', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'd2',
      env: 'PROD',
      url: 'https://api.example.com',
      healthPath: '/health',
      smoke: true,
      monitor: false,
    });
    assert.equal(c.request.url, 'https://api.example.com/health');
  });

  it('handles trailing slash on url with leading slash on path (no double)', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'd3',
      env: 'PROD',
      url: 'https://api.example.com/',
      healthPath: '/health',
      smoke: true,
      monitor: false,
    });
    assert.equal(c.request.url, 'https://api.example.com/health');
  });

  it('does not append the previous default "/health" when healthPath is undefined', () => {
    // Regression: an earlier version defaulted healthPath to "/health",
    // appending it onto urls that already had a full path and producing
    // ".../healthz/ready/health" 404s.
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'd4',
      env: 'PROD',
      url: 'https://api.example.com/some/deep/path',
      smoke: false,
      monitor: true,
    });
    assert.equal(c.request.url, 'https://api.example.com/some/deep/path');
    assert.ok(!c.request.url.endsWith('/health'));
  });
});

describe('dotnet-health factory: headers (literal value)', () => {
  it('always includes Accept: application/json', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'dh-hdr-1',
      env: 'PROD',
      url: 'https://api.example.com/health',
      smoke: true,
      monitor: false,
    });
    const accept = c.request.headers?.find((h) => h.key.toLowerCase() === 'accept');
    assert.equal(accept?.value, 'application/json');
  });

  it('appends literal-value headers after the default', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'dh-hdr-2',
      env: 'PROD',
      url: 'https://api.example.com/health',
      headers: [{ key: 'X-Tenant', value: 'acme' }],
      smoke: true,
      monitor: false,
    });
    const keys = c.request.headers.map((h) => h.key);
    assert.deepEqual(keys, ['Accept', 'X-Tenant']);
  });

  it('lets the consumer override Accept (HTTP last-key-wins)', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'dh-hdr-3',
      env: 'PROD',
      url: 'https://api.example.com/health',
      headers: [{ key: 'Accept', value: 'application/health+json' }],
      smoke: true,
      monitor: false,
    });
    const accepts = c.request.headers.filter((h) => h.key === 'Accept');
    assert.equal(accepts.length, 2);
    assert.equal(accepts[1].value, 'application/health+json');
  });
});

describe('dotnet-health factory: headers (valueFromEnv)', () => {
  it('resolves valueFromEnv from process.env at deploy time and stashes as per-check env', () => {
    const prev = process.env.TEST_HEALTH_KEY;
    process.env.TEST_HEALTH_KEY = 's3cret-from-ci';
    try {
      const c = tryFactory('dotnet-health', {
        kind: 'dotnet-health',
        logicalId: 'dh-env-1',
        env: 'PROD',
        url: 'https://api.example.com/health',
        headers: [{ key: 'X-Health-Key', valueFromEnv: 'TEST_HEALTH_KEY' }],
        smoke: true,
        monitor: false,
      });
      // Header gets the template, not the literal secret.
      const hk = c.request.headers.find((h) => h.key === 'X-Health-Key');
      assert.equal(hk.value, '{{TEST_HEALTH_KEY}}');
      // The secret lands in the per-check env vars, scoped to this construct.
      const env = c.environmentVariables.find((v) => v.key === 'TEST_HEALTH_KEY');
      assert.equal(env.value, 's3cret-from-ci');
    } finally {
      if (prev === undefined) delete process.env.TEST_HEALTH_KEY;
      else process.env.TEST_HEALTH_KEY = prev;
    }
  });

  it('throws clearly when valueFromEnv references a missing env var', () => {
    delete process.env.MISSING_AT_DEPLOY;
    assert.throws(
      () =>
        tryFactory('dotnet-health', {
          kind: 'dotnet-health',
          logicalId: 'dh-env-miss',
          env: 'PROD',
          url: 'https://api.example.com/health',
          headers: [{ key: 'X-Health-Key', valueFromEnv: 'MISSING_AT_DEPLOY' }],
          smoke: true,
          monitor: false,
        }),
      /MISSING_AT_DEPLOY.+not set in the deploy environment/,
    );
  });

  it('emits no environmentVariables when no header uses valueFromEnv', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'dh-no-env',
      env: 'PROD',
      url: 'https://api.example.com/health',
      smoke: true,
      monitor: false,
    });
    // Checkly's construct normalises an absent env-var list to []; we
    // care that nothing got added, not the exact representation.
    assert.equal((c.environmentVariables ?? []).length, 0);
  });

  it('mixes literal and valueFromEnv headers in declared order', () => {
    process.env.MIX_KEY = 'abc';
    try {
      const c = tryFactory('dotnet-health', {
        kind: 'dotnet-health',
        logicalId: 'dh-env-mix',
        env: 'PROD',
        url: 'https://api.example.com/health',
        headers: [
          { key: 'X-Tenant', value: 'acme' },
          { key: 'X-Health-Key', valueFromEnv: 'MIX_KEY' },
        ],
        smoke: true,
        monitor: false,
      });
      const keys = c.request.headers.map((h) => h.key);
      assert.deepEqual(keys, ['Accept', 'X-Tenant', 'X-Health-Key']);
      assert.equal(c.request.headers.find((h) => h.key === 'X-Health-Key').value, '{{MIX_KEY}}');
    } finally {
      delete process.env.MIX_KEY;
    }
  });
});

describe('dotnet-health factory: assertions', () => {
  it('default overall status is "Healthy"', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'da1',
      env: 'PROD',
      url: 'https://api.example.com/health',
      smoke: false,
      monitor: true,
    });
    // statusCode(200) + jsonBody($.status === Healthy) = 2 assertions baseline
    assert.equal(c.request.assertions.length, 2);
  });

  it('adds one assertion per expectedComponent', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'da2',
      env: 'PROD',
      url: 'https://api.example.com/health',
      expectedComponents: ['sql', 'redis', 'queue'],
      smoke: false,
      monitor: true,
    });
    // 2 baseline + 3 component assertions.
    assert.equal(c.request.assertions.length, 5);
  });
});

describe('xpath factory', () => {
  it('emits one assertion per contains entry plus status', () => {
    const c = tryFactory('xpath', {
      kind: 'xpath',
      logicalId: 'x1',
      env: 'PROD',
      url: 'https://example.com',
      expect: { contains: ['Foo', 'Bar', 'Baz'] },
      smoke: true,
      monitor: false,
    });
    // statusCode(200) + 3 contains assertions
    assert.equal(c.request.assertions.length, 4);
  });

  it('emits notContains assertions when configured', () => {
    const c = tryFactory('xpath', {
      kind: 'xpath',
      logicalId: 'x2',
      env: 'PROD',
      url: 'https://example.com',
      expect: { contains: ['Foo'], notContains: ['Bar', 'Baz'] },
      smoke: true,
      monitor: false,
    });
    assert.equal(c.request.assertions.length, 4);
  });
});

describe('xpath-spa factory: env-var contract', () => {
  it('sets CHECK_KIND="xpath-spa" and a serialised CHECK_PARAMS', () => {
    const c = tryFactory('xpath-spa', {
      kind: 'xpath-spa',
      logicalId: 'xs1',
      env: 'PROD',
      url: 'https://example.com',
      expect: [{ selector: 'h1', contains: 'Welcome' }],
      smoke: true,
      monitor: false,
    });
    const env = Object.fromEntries(c.environmentVariables.map((v) => [v.key, v.value]));
    assert.equal(env.CHECK_KIND, 'xpath-spa');
    assert.equal(env.CHECK_TARGET_URL, 'https://example.com');
    const params = JSON.parse(env.CHECK_PARAMS);
    assert.deepEqual(params.selectors, [{ selector: 'h1', contains: 'Welcome' }]);
    assert.equal(params.waitUntil, 'domcontentloaded');
  });

  it('honours an explicit waitUntil override', () => {
    const c = tryFactory('xpath-spa', {
      kind: 'xpath-spa',
      logicalId: 'xs2',
      env: 'PROD',
      url: 'https://example.com',
      waitUntil: 'networkidle',
      expect: [{ selector: 'main', count: 1 }],
      smoke: true,
      monitor: false,
    });
    const params = JSON.parse(c.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.equal(params.waitUntil, 'networkidle');
  });
});

describe('gdpr factory', () => {
  it('serialises the resolved EU/UK/CA preset rules into CHECK_PARAMS', () => {
    const c = tryFactory('gdpr', {
      kind: 'gdpr',
      logicalId: 'g1',
      env: 'PROD',
      url: 'https://example.com',
      complianceMode: 'targeted',
      smoke: true,
      monitor: false,
    });
    const params = JSON.parse(c.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.equal(params.complianceMode, 'targeted');
    assert.ok(params.trackingDomains.includes('google-analytics.com'));
    assert.ok(params.cookieBlocklist.google_analytics.includes('_ga'));
    assert.ok(params.restrictedRegions.includes('DE'));
  });

  it('applies overrides.trackingDomains.add', () => {
    const c = tryFactory('gdpr', {
      kind: 'gdpr',
      logicalId: 'g2',
      env: 'PROD',
      url: 'https://example.com',
      complianceMode: 'global',
      overrides: { trackingDomains: { add: ['custom-tracker.example.com'] } },
      smoke: true,
      monitor: false,
    });
    const params = JSON.parse(c.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.ok(params.trackingDomains.includes('custom-tracker.example.com'));
  });

  it('applies overrides.cookieBlocklist.remove', () => {
    const c = tryFactory('gdpr', {
      kind: 'gdpr',
      logicalId: 'g3',
      env: 'PROD',
      url: 'https://example.com',
      complianceMode: 'global',
      overrides: { cookieBlocklist: { remove: ['youtube'] } },
      smoke: true,
      monitor: false,
    });
    const params = JSON.parse(c.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.equal(params.cookieBlocklist.youtube, undefined);
  });

  it('requires explicit rules when preset is "none"', () => {
    assert.throws(() => {
      tryFactory('gdpr', {
        kind: 'gdpr',
        logicalId: 'g4',
        env: 'PROD',
        url: 'https://example.com',
        complianceMode: 'global',
        preset: 'none',
        smoke: true,
        monitor: false,
      });
    }, /preset is "none" but no explicit "rules" supplied/);
  });
});

describe('common factory behavior', () => {
  const everyKind = [
    { kind: 'uptime-ssl', extra: {} },
    { kind: 'redirect', extra: { expectedLocation: 'https://example.com/' } },
    { kind: 'dotnet-health', extra: {} },
    { kind: 'xpath', extra: { expect: { contains: ['x'] } } },
    { kind: 'xpath-spa', extra: { expect: [{ selector: 'h1', contains: 'x' }] } },
    { kind: 'gdpr', extra: { complianceMode: 'targeted' } },
  ];

  for (const { kind, extra } of everyKind) {
    it(`${kind}: per-entry tags get merged with auto-emitted set`, () => {
      const c = tryFactory(kind, {
        kind,
        logicalId: `t-${kind}`,
        env: 'PROD',
        url: 'https://example.com',
        tags: ['extra:tag', 'another:one'],
        smoke: true,
        monitor: false,
        ...extra,
      });
      assert.ok(c.tags.includes('extra:tag'));
      assert.ok(c.tags.includes('another:one'));
      assert.ok(c.tags.includes('source:checkly-templates'));
    });

    it(`${kind}: per-entry locations override project default`, () => {
      const c = tryFactory(
        kind,
        {
          kind,
          logicalId: `tl-${kind}`,
          env: 'PROD',
          url: 'https://example.com',
          locations: ['us-east-1', 'ap-southeast-1'],
          smoke: true,
          monitor: false,
          ...extra,
        },
        { ...ctx, defaultLocations: ['eu-central-1'] },
      );
      assert.deepEqual([...c.locations].sort(), ['ap-southeast-1', 'us-east-1']);
    });
  }
});
