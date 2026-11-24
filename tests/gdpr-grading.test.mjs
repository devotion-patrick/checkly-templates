// Grading and region detection for the gdpr spec, without a browser.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
import { repoRoot } from './helpers.mjs';

const jiti = createJiti(import.meta.url);
const g = await jiti.import(path.join(repoRoot, 'src', 'checks', 'gdpr', '__checks__', 'grading.ts'));

const PAGE = 'https://www.example.com/';
const GA = (query) => `https://region1.google-analytics.com/g/collect?v=2&tid=G-XXXX&${query}`;

function obs(over = {}) {
  return { pageUrl: PAGE, cookies: [], trackingRequests: [], gtmLoaded: false, consentDefault: null, ...over };
}

function req(url, domain, at = 2000) {
  return { url, domain, at };
}

const rules = (findings) => findings.map((f) => `${f.severity} ${f.rule}`);

describe('parseGoogleConsent', () => {
  it('reads gcs as G1<ad_storage><analytics_storage>', () => {
    assert.equal(g.parseGoogleConsent(GA('gcs=G100')).state, 'denied');
    assert.equal(g.parseGoogleConsent(GA('gcs=G101')).state, 'granted');
    assert.equal(g.parseGoogleConsent(GA('gcs=G110')).state, 'granted');
    assert.equal(g.parseGoogleConsent(GA('gcs=G111')).state, 'granted');
  });

  it('falls back to gcd when gcs is missing', () => {
    assert.equal(g.parseGoogleConsent(GA('gcd=13p3p3p2p5l1')).state, 'denied');
    assert.equal(g.parseGoogleConsent(GA('gcd=13r3r3r2r5l1')).state, 'granted');
    assert.equal(g.parseGoogleConsent(GA('gcd=13l3l3l3l1')).state, 'none');
  });

  it('prefers gcs over gcd', () => {
    assert.equal(g.parseGoogleConsent(GA('gcs=G100&gcd=13v3v3v2v5l1')).state, 'denied');
  });

  it('treats no gcs or gcd as no consent signal', () => {
    assert.equal(g.parseGoogleConsent(GA('en=page_view')).state, 'none');
    assert.equal(g.parseGoogleConsent(GA('gcs=garbage')).state, 'none');
  });
});

describe('gradeFindings', () => {
  // The stengg.com run: GTM with denied default first, one GA ping at G100, no cookies.
  const stengg = obs({
    gtmLoaded: true,
    consentDefault: { at: 1000 },
    trackingRequests: [req(GA('gcs=G100'), 'google-analytics.com')],
  });

  it('grades a Consent Mode advanced ping INFO under standard, so the run passes without warnings', () => {
    const findings = g.gradeFindings(stengg, 'standard');
    assert.deepEqual(rules(findings), ['INFO google-request-denied-cookieless', 'INFO gtm-consent-default-first']);
    assert.equal(g.verdictOf(findings), 'passed');
    assert.equal(findings.filter((f) => f.severity === 'WARN').length, 0);
    assert.match(findings[0].detail, /fails under strict/);
  });

  it('never enforces under report, which grades with the standard table', () => {
    assert.equal(g.gradingLevelFor('report'), 'standard');
    assert.equal(g.shouldEnforce('report', true), false);
    assert.equal(g.shouldEnforce('strict', true), true);
    assert.equal(g.shouldEnforce('strict', false), false);
    const findings = g.gradeFindings(stengg, g.gradingLevelFor('report'));
    assert.equal(g.verdictOf(findings), 'passed');
  });

  it('grades the same ping FAIL under strict', () => {
    const findings = g.gradeFindings(stengg, 'strict');
    assert.deepEqual(rules(findings), ['FAIL google-request-denied-cookieless', 'INFO gtm-consent-default-first']);
    assert.equal(g.verdictOf(findings), 'failed');
  });

  for (const level of ['standard', 'strict']) {
    it(`fails a non-essential cookie under ${level}`, () => {
      const findings = g.gradeFindings(
        obs({ cookies: [{ name: '_ga', domain: '.example.com', party: 'first', rule: 'google_analytics:_ga' }] }),
        level,
      );
      assert.deepEqual(rules(findings), ['FAIL cookie-before-consent']);
    });

    it(`fails a Google ping with consent granted under ${level}`, () => {
      const findings = g.gradeFindings(obs({ trackingRequests: [req(GA('gcs=G101'), 'google-analytics.com')] }), level);
      assert.deepEqual(rules(findings), ['FAIL google-request-consent-granted']);
    });

    it(`fails a Google ping with no consent signal under ${level}`, () => {
      const findings = g.gradeFindings(obs({ trackingRequests: [req(GA('en=page_view'), 'google-analytics.com')] }), level);
      assert.deepEqual(rules(findings), ['FAIL google-request-no-consent-signal']);
    });

    it(`fails a non-Google tracker under ${level}`, () => {
      const findings = g.gradeFindings(
        obs({ trackingRequests: [req('https://connect.facebook.net/en_US/fbevents.js', 'facebook.net')] }),
        level,
      );
      assert.deepEqual(rules(findings), ['FAIL tracking-request-before-consent']);
    });

    it(`fails GTM with no consent default under ${level}`, () => {
      assert.deepEqual(rules(g.gradeFindings(obs({ gtmLoaded: true }), level)), ['FAIL gtm-no-consent-default']);
    });
  }

  it('fails a consent default set after tags fired', () => {
    const findings = g.gradeFindings(
      obs({ gtmLoaded: true, consentDefault: { at: 5000 }, trackingRequests: [req(GA('gcs=G100'), 'google-analytics.com', 2000)] }),
      'standard',
    );
    assert.ok(rules(findings).includes('FAIL gtm-no-consent-default'));
  });

  it('fails a denied ping when Google cookies were set anyway', () => {
    const findings = g.gradeFindings(
      obs({
        cookies: [{ name: '_ga', domain: '.example.com', party: 'first', rule: 'google_analytics:_ga' }],
        trackingRequests: [req(GA('gcs=G100'), 'google-analytics.com')],
      }),
      'standard',
    );
    assert.deepEqual(rules(findings), ['FAIL cookie-before-consent', 'FAIL google-request-denied-with-cookies']);
  });

  it('grades the test_cookie probe INFO', () => {
    const findings = g.gradeFindings(
      obs({ cookies: [{ name: 'test_cookie', domain: '.doubleclick.net', party: 'third', rule: 'google_doubleclick:test_cookie' }] }),
      'strict',
    );
    assert.deepEqual(rules(findings), ['INFO probe-cookie-before-consent']);
  });

  it('groups repeated pings into one finding with a count', () => {
    const findings = g.gradeFindings(
      obs({ trackingRequests: [1, 2, 3].map((i) => req(GA(`gcs=G100&_s=${i}`), 'google-analytics.com')) }),
      'standard',
    );
    assert.equal(findings.length, 1);
    assert.match(findings[0].detail, /\(3 requests\)$/);
  });

  it('passes a page with nothing before consent', () => {
    assert.equal(g.verdictOf(g.gradeFindings(obs(), 'strict')), 'passed');
  });
});

describe('resolveCheckLevel', () => {
  it('defaults to standard', () => {
    assert.deepEqual(g.resolveCheckLevel(undefined, undefined), { level: 'standard', source: 'default' });
  });

  it('reads GDPR_CHECK_LEVEL', () => {
    assert.equal(g.resolveCheckLevel(undefined, 'STRICT').level, 'strict');
  });

  it('lets the site checkLevel win over GDPR_CHECK_LEVEL', () => {
    assert.deepEqual(g.resolveCheckLevel('report', 'strict'), { level: 'report', source: 'site checkLevel' });
  });

  it('rejects an unknown level rather than guessing', () => {
    assert.throws(() => g.resolveCheckLevel(undefined, 'strcit'), /GDPR_CHECK_LEVEL="strcit" is not a check level/);
  });
});

describe('detectRegion', () => {
  const regionRules = { restrictedRegions: ['DE', 'GB', 'US-CA'], restrictedChecklyLocations: ['eu-west-1'] };
  const respond = (status, body = {}) => async () => ({ ok: status < 400, status, json: async () => body });
  const unused = async () => {
    throw new Error('fetch should not be called');
  };

  it('falls back to restricted on a 429 and says why', async () => {
    const r = await g.detectRegion(regionRules, {}, respond(429));
    assert.equal(r.inRestricted, true);
    assert.equal(r.source, 'fallback');
    assert.match(r.reason, /429/);
    assert.match(g.describeRegion(r), /UNKNOWN via fallback .*429.*treated as restricted/);
  });

  it('falls back when ipapi.co reports a quota error as 200', async () => {
    const r = await g.detectRegion(regionRules, {}, respond(200, { error: true, reason: 'RateLimited' }));
    assert.equal(r.source, 'fallback');
  });

  it('falls back when fetch throws', async () => {
    const r = await g.detectRegion(regionRules, {}, unused);
    assert.equal(r.source, 'fallback');
    assert.equal(r.inRestricted, true);
  });

  it('uses GDPR_REGION without a lookup', async () => {
    assert.deepEqual(await g.detectRegion(regionRules, { GDPR_REGION: 'sg' }, unused), {
      inRestricted: false,
      region: 'SG',
      source: 'GDPR_REGION',
    });
    assert.equal((await g.detectRegion(regionRules, { GDPR_REGION: 'US-CA' }, unused)).inRestricted, true);
    assert.equal((await g.detectRegion(regionRules, { GDPR_REGION: 'DE-BY' }, unused)).inRestricted, true);
  });

  it('sends GDPR_GEOIP_API_KEY to the provider', async () => {
    let called = '';
    const fetchImpl = async (url) => {
      called = url;
      return { ok: true, status: 200, json: async () => ({ country_code: 'SG' }) };
    };
    const r = await g.detectRegion(regionRules, { GDPR_GEOIP_API_KEY: 'k 1' }, fetchImpl);
    assert.equal(called, 'https://ipapi.co/json/?key=k%201');
    assert.equal(r.source, 'ipapi');
    assert.equal(r.inRestricted, false);
  });

  it('uses CHECK_LOCATION without a lookup', async () => {
    assert.deepEqual(await g.detectRegion(regionRules, { CHECK_LOCATION: 'eu-west-1' }, unused), {
      inRestricted: true,
      region: 'eu-west-1',
      source: 'CHECK_LOCATION',
    });
    assert.equal((await g.detectRegion(regionRules, { CHECK_LOCATION: 'ap-southeast-2' }, unused)).inRestricted, false);
  });

  it('lets CHECK_LOCATION win over GDPR_REGION and CHECKLY_REGION', async () => {
    const env = { CHECK_LOCATION: 'ap-southeast-2', GDPR_REGION: 'DE', CHECKLY_REGION: 'eu-west-1' };
    assert.equal((await g.detectRegion(regionRules, env, unused)).source, 'CHECK_LOCATION');
  });

  it('reads REGION, as browser checks expose it, via checkly-env', async () => {
    assert.deepEqual(await g.detectRegion(regionRules, { REGION: 'ap-southeast-1' }, unused), {
      inRestricted: false,
      region: 'ap-southeast-1',
      source: 'checkly-env',
    });
    assert.deepEqual(await g.detectRegion(regionRules, { REGION: 'eu-west-1' }, unused), {
      inRestricted: true,
      region: 'eu-west-1',
      source: 'checkly-env',
    });
  });

  it('lets CHECKLY_REGION win over REGION, and both lose to CHECK_LOCATION and GDPR_REGION', async () => {
    const both = await g.detectRegion(regionRules, { CHECKLY_REGION: 'eu-west-1', REGION: 'ap-southeast-1' }, unused);
    assert.equal(both.region, 'eu-west-1');
    assert.equal((await g.detectRegion(regionRules, { CHECK_LOCATION: 'ap-southeast-2', REGION: 'eu-west-1' }, unused)).source, 'CHECK_LOCATION');
    assert.equal((await g.detectRegion(regionRules, { GDPR_REGION: 'SG', REGION: 'eu-west-1' }, unused)).source, 'GDPR_REGION');
  });

  it('falls through an empty or malformed REGION to the lookup', async () => {
    for (const REGION of ['', '  ', 'production', 'EU-WEST-1', 'eu-west']) {
      const r = await g.detectRegion(regionRules, { REGION }, respond(429));
      assert.equal(r.source, 'fallback', `REGION="${REGION}" should fall through`);
    }
  });

  it('keeps the CHECK_IN_RESTRICTED_REGION and CHECKLY_REGION precedence', async () => {
    assert.equal((await g.detectRegion(regionRules, { CHECK_IN_RESTRICTED_REGION: 'false', GDPR_REGION: 'DE' }, unused)).inRestricted, false);
    assert.equal((await g.detectRegion(regionRules, { CHECKLY_REGION: 'eu-west-1' }, unused)).source, 'checkly-env');
    assert.equal((await g.detectRegion(regionRules, { GDPR_REGION: 'SG', CHECKLY_REGION: 'eu-west-1' }, unused)).source, 'GDPR_REGION');
  });
});
