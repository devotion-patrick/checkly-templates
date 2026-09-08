// Per-kind factory output tests. The factory takes (entry, ctx) and
// returns a Checkly construct (ApiCheck or PlaywrightCheck). We assert
// on the construct's observable properties — specifically URL, name,
// tags, and per-kind synthesis — so a future refactor that silently
// breaks any of these falls into a red test instead of a customer
// pipeline.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tryFactory, baseContext, REGISTRY } from './helpers.mjs';

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
    assert.ok(c.tags.includes('source:checkly-templates'), `tags: ${c.tags.join(', ')}`);
    assert.ok(c.tags.includes('acme.codename:acme-site'));
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

  it('emits a tmpl-version:<kind>@<version> tag matching the registry-exposed module version', () => {
    const c = tryFactory('uptime-ssl', {
      kind: 'uptime-ssl',
      logicalId: 'u5',
      env: 'PROD',
      url: 'https://example.com',
      smoke: false,
      monitor: true,
    });
    const expected = `tmpl-version:uptime-ssl@${REGISTRY['uptime-ssl'].version}`;
    assert.ok(c.tags.includes(expected), `tags: ${c.tags.join(', ')}, expected: ${expected}`);
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

  it('emits only DOTNET_HEALTH_PARAMS when no header uses valueFromEnv', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'dh-no-env',
      env: 'PROD',
      url: 'https://api.example.com/health',
      smoke: true,
      monitor: false,
    });
    // The severity-check params always ride along as an env var; only a
    // header's valueFromEnv adds anything beyond that one.
    const keys = c.environmentVariables.map((v) => v.key);
    assert.deepEqual(keys, ['DOTNET_HEALTH_PARAMS']);
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

describe('dotnet-health factory: severity params (via DOTNET_HEALTH_PARAMS + tearDownScript)', () => {
  // Declarative statusCode/jsonBody assertions can't express "degraded is
  // a warning, unhealthy is a failure" — see factory.ts's TEARDOWN_SCRIPT
  // comment. All of that logic now lives in a teardown script whose
  // parameters travel via this env var, so these tests assert on the
  // params rather than a request.assertions array that no longer exists.
  function params(c) {
    return JSON.parse(c.environmentVariables.find((v) => v.key === 'DOTNET_HEALTH_PARAMS').value);
  }

  it('defaults healthyValues to ["Healthy"] and degradedValues to ["Degraded"]', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'da1',
      env: 'PROD',
      url: 'https://api.example.com/health',
      smoke: false,
      monitor: true,
    });
    const p = params(c);
    assert.deepEqual(p.healthyValues, ['Healthy']);
    assert.deepEqual(p.degradedValues, ['Degraded']);
    assert.equal(p.statusPath, '$.status');
    assert.equal(p.failOnDegraded, false);
  });

  it('expectedOverallStatus still works as a healthyValues fallback', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'da1b',
      env: 'PROD',
      url: 'https://api.example.com/health',
      expectedOverallStatus: 'UP',
      smoke: false,
      monitor: true,
    });
    assert.deepEqual(params(c).healthyValues, ['UP']);
  });

  it('healthyValues overrides expectedOverallStatus when both are set', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'da1c',
      env: 'PROD',
      url: 'https://api.example.com/health',
      expectedOverallStatus: 'UP',
      healthyValues: ['UP', 'STARTING'],
      smoke: false,
      monitor: true,
    });
    assert.deepEqual(params(c).healthyValues, ['UP', 'STARTING']);
  });

  it('passes expectedComponents through untouched', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'da2',
      env: 'PROD',
      url: 'https://api.example.com/health',
      expectedComponents: ['sql', 'redis', 'queue'],
      smoke: false,
      monitor: true,
    });
    assert.deepEqual(params(c).expectedComponents, ['sql', 'redis', 'queue']);
  });

  it('supports overriding statusPath/componentsPath/degradedValues/failOnDegraded for non-ASP.NET conventions', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'da3',
      env: 'PROD',
      url: 'https://api.example.com/actuator/health',
      statusPath: '$.status',
      componentsPath: "$.components['{name}'].status",
      healthyValues: ['UP'],
      degradedValues: [],
      failOnDegraded: true,
      expectedComponents: ['db'],
      smoke: false,
      monitor: true,
    });
    const p = params(c);
    assert.equal(p.componentsPath, "$.components['{name}'].status");
    assert.deepEqual(p.healthyValues, ['UP']);
    assert.deepEqual(p.degradedValues, []);
    assert.equal(p.failOnDegraded, true);
  });

  it('always attaches a tearDownScript with inline content', () => {
    const c = tryFactory('dotnet-health', {
      kind: 'dotnet-health',
      logicalId: 'da4',
      env: 'PROD',
      url: 'https://api.example.com/health',
      smoke: false,
      monitor: true,
    });
    assert.ok(c.tearDownScript?.content?.includes('DOTNET_HEALTH_PARAMS'));
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

describe('custom-api factory', () => {
  it('defaults method to GET and forces followRedirects: false', () => {
    const c = tryFactory('custom-api', {
      kind: 'custom-api',
      logicalId: 'ca1',
      env: 'PROD',
      url: 'https://api.example.com/status',
      script: "if (response.statusCode !== 200) throw new Error('fail');",
      smoke: true,
      monitor: false,
    });
    assert.equal(c.request.method, 'GET');
    assert.equal(c.request.followRedirects, false);
  });

  it('honours an explicit method and body', () => {
    const c = tryFactory('custom-api', {
      kind: 'custom-api',
      logicalId: 'ca2',
      env: 'PROD',
      url: 'https://api.example.com/orders',
      method: 'POST',
      body: '{"foo":"bar"}',
      script: "if (response.statusCode !== 201) throw new Error('fail');",
      smoke: true,
      monitor: false,
    });
    assert.equal(c.request.method, 'POST');
    assert.equal(c.request.body, '{"foo":"bar"}');
  });

  it('wires entry.script verbatim as tearDownScript.content — no declarative assertions', () => {
    const script = "console.log('checking'); if (response.statusCode >= 500) throw new Error('down');";
    const c = tryFactory('custom-api', {
      kind: 'custom-api',
      logicalId: 'ca3',
      env: 'PROD',
      url: 'https://api.example.com/status',
      script,
      smoke: true,
      monitor: false,
    });
    assert.equal(c.tearDownScript.content, script);
    assert.equal(c.request.assertions, undefined);
  });

  it('resolves headers the same way as dotnet-health (literal + valueFromEnv)', () => {
    process.env.TEST_CUSTOM_API_KEY = 'sekret';
    try {
      const c = tryFactory('custom-api', {
        kind: 'custom-api',
        logicalId: 'ca4',
        env: 'PROD',
        url: 'https://api.example.com/status',
        headers: [
          { key: 'X-Tenant', value: 'acme' },
          { key: 'X-Api-Key', valueFromEnv: 'TEST_CUSTOM_API_KEY' },
        ],
        script: 'true;',
        smoke: true,
        monitor: false,
      });
      const keys = c.request.headers.map((h) => h.key);
      assert.deepEqual(keys, ['X-Tenant', 'X-Api-Key']);
      assert.equal(c.request.headers.find((h) => h.key === 'X-Api-Key').value, '{{TEST_CUSTOM_API_KEY}}');
      const env = c.environmentVariables.find((v) => v.key === 'TEST_CUSTOM_API_KEY');
      assert.equal(env.value, 'sekret');
    } finally {
      delete process.env.TEST_CUSTOM_API_KEY;
    }
  });

  it('emits no environmentVariables when no header uses valueFromEnv', () => {
    const c = tryFactory('custom-api', {
      kind: 'custom-api',
      logicalId: 'ca5',
      env: 'PROD',
      url: 'https://api.example.com/status',
      script: 'true;',
      smoke: true,
      monitor: false,
    });
    assert.equal((c.environmentVariables ?? []).length, 0);
  });
});

describe('restricted-admin factory', () => {
  function params(c) {
    return JSON.parse(c.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
  }

  it('reuses the launch-readiness spec verbatim (CHECK_KIND stays "launch-readiness")', () => {
    const c = tryFactory('restricted-admin', {
      kind: 'restricted-admin',
      logicalId: 'ra1',
      env: 'PROD',
      url: 'https://example.com/admin',
      expectedAccess: 'gated',
      smoke: true,
      monitor: false,
    });
    const env = Object.fromEntries(c.environmentVariables.map((v) => [v.key, v.value]));
    assert.equal(env.CHECK_KIND, 'launch-readiness');
    assert.equal(env.CHECK_TARGET_URL, 'https://example.com/admin');
  });

  it('maps expectedAccess: "gated" to expectPubliclyAccessible: false', () => {
    const c = tryFactory('restricted-admin', {
      kind: 'restricted-admin',
      logicalId: 'ra2',
      env: 'PROD',
      url: 'https://example.com/admin',
      expectedAccess: 'gated',
      smoke: true,
      monitor: false,
    });
    assert.equal(params(c).expectPubliclyAccessible, false);
  });

  it('maps expectedAccess: "either" to expectPubliclyAccessible: "either"', () => {
    const c = tryFactory('restricted-admin', {
      kind: 'restricted-admin',
      logicalId: 'ra3',
      env: 'PROD',
      url: 'https://example.com/admin',
      expectedAccess: 'either',
      smoke: true,
      monitor: false,
    });
    assert.equal(params(c).expectPubliclyAccessible, 'either');
  });

  it('passes securityHeaders through to checks.securityHeaders, defaulting to []', () => {
    const withHeaders = tryFactory('restricted-admin', {
      kind: 'restricted-admin',
      logicalId: 'ra4',
      env: 'PROD',
      url: 'https://example.com/admin',
      expectedAccess: 'either',
      securityHeaders: ['Strict-Transport-Security', 'X-Frame-Options'],
      smoke: true,
      monitor: false,
    });
    assert.deepEqual(params(withHeaders).checks.securityHeaders, ['Strict-Transport-Security', 'X-Frame-Options']);

    const withoutHeaders = tryFactory('restricted-admin', {
      kind: 'restricted-admin',
      logicalId: 'ra5',
      env: 'PROD',
      url: 'https://example.com/admin',
      expectedAccess: 'gated',
      smoke: true,
      monitor: false,
    });
    assert.deepEqual(params(withoutHeaders).checks.securityHeaders, []);
  });

  it('honours waitUntil and followJsRedirect overrides', () => {
    const c = tryFactory('restricted-admin', {
      kind: 'restricted-admin',
      logicalId: 'ra6',
      env: 'PROD',
      url: 'https://example.com/admin',
      expectedAccess: 'gated',
      waitUntil: 'networkidle',
      followJsRedirect: true,
      smoke: true,
      monitor: false,
    });
    const p = params(c);
    assert.equal(p.waitUntil, 'networkidle');
    assert.equal(p.followJsRedirect, true);
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
    { kind: 'custom-api', extra: { script: 'if (response.statusCode >= 500) throw new Error("down");' } },
    { kind: 'restricted-admin', extra: { expectedAccess: 'gated' } },
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
