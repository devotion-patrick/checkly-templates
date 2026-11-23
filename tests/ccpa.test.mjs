// ccpa kind: grading, signals, factory and schema.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
import { baseContext, configWith, repoRoot, tryFactory, validateConfig } from './helpers.mjs';

const jiti = createJiti(import.meta.url);
const g = await jiti.import(path.join(repoRoot, 'src', 'checks', 'ccpa', '__checks__', 'grading.ts'));
const { resolveRules } = await jiti.import(path.join(repoRoot, 'src', 'checks', 'ccpa', 'env.ts'));

const PAGE = 'https://www.example.com/';
const rules = resolveRules(undefined);
const META_SCRIPT = { url: 'https://connect.facebook.net/en_US/fbevents.js', resourceType: 'script' };
const metaHit = (q = '') => ({ url: `https://www.facebook.com/tr/?id=1&ev=PageView${q}`, resourceType: 'image' });
const GA = { url: 'https://region1.google-analytics.com/g/collect?v=2', resourceType: 'fetch' };

function pass(over = {}) {
  return { requests: [], adCookies: [], privacy: {}, ...over };
}

function obs(over = {}) {
  return {
    pageUrl: PAGE,
    adTechDomains: rules.adTechDomains,
    analyticsDomains: rules.analyticsDomains,
    baseline: pass({ requests: [META_SCRIPT, metaHit()] }),
    gpc: pass(),
    optOutLink: { found: true, via: 'text "do not sell"' },
    ...over,
  };
}

const graded = (o, level = 'standard') => g.gradeFindings(o, level).map((f) => `${f.severity} ${f.rule}`);

describe('restrictionSignal', () => {
  it('reads Meta Limited Data Use', () => {
    assert.equal(g.restrictionSignal(metaHit('&dpo=LDU&dpoco=1&dpost=1000').url), 'dpo=LDU');
    assert.equal(g.restrictionSignal(metaHit().url), null);
  });

  it('reads Google rdp and npa, in the query or a Floodlight path', () => {
    assert.equal(g.restrictionSignal('https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1/?rdp=1'), 'rdp=1');
    assert.equal(g.restrictionSignal('https://ad.doubleclick.net/activity;src=1;type=x;npa=1;ord=2'), 'npa=1');
  });

  it('reads denied ad consent from gcd on Google ads hits', () => {
    assert.match(g.restrictionSignal('https://www.googleadservices.com/pagead/conversion/1/?gcd=13r3r3p2p5l1'), /ad consent denied/);
  });

  it('ignores signals on a vendor they do not belong to', () => {
    assert.equal(g.restrictionSignal('https://bat.bing.com/action/0?rdp=1'), null);
  });
});

describe('privacyOptOut', () => {
  it('reads GPP usca and usnat sections', () => {
    assert.equal(g.privacyOptOut({ gppString: 'x', gppParsed: { usca: { SaleOptOut: 1, SharingOptOut: 1 } } }), 'opted-out');
    assert.equal(g.privacyOptOut({ gppString: 'x', gppParsed: { usnat: { SaleOptOut: 2, SharingOptOut: 2 } } }), 'not-opted-out');
  });

  it('reads the US Privacy string', () => {
    assert.equal(g.privacyOptOut({ usp: '1YYN' }), 'opted-out');
    assert.equal(g.privacyOptOut({ usp: '1YNN' }), 'not-opted-out');
  });

  it('separates an undecoded string from none at all', () => {
    assert.equal(g.privacyOptOut({ gppString: 'DBABL~x' }), 'unknown');
    assert.equal(g.privacyOptOut({}), 'absent');
  });
});

describe('gradeFindings', () => {
  it('passes a site that stops ad-tech under GPC and has the link', () => {
    const findings = g.gradeFindings(obs(), 'strict');
    assert.equal(g.verdictOf(findings), 'passed');
    assert.deepEqual(graded(obs()), ['INFO opt-out-link', 'INFO tracking-before-opt-out']);
  });

  for (const level of ['standard', 'strict']) {
    it(`fails ad-tech hits after GPC with no restriction signal under ${level}`, () => {
      const o = obs({ gpc: pass({ requests: [META_SCRIPT, metaHit()] }) });
      assert.ok(graded(o, level).includes('FAIL sale-after-gpc'));
    });

    it(`fails an ad cookie after GPC under ${level}`, () => {
      const o = obs({ gpc: pass({ adCookies: [{ name: '_fbp', domain: '.example.com', rule: 'meta:_fbp' }] }) });
      assert.ok(graded(o, level).includes('FAIL ad-cookie-after-gpc'));
    });

    it(`fails a missing opt-out link when ad-tech was seen under ${level}`, () => {
      const o = obs({ optOutLink: { found: false } });
      assert.ok(graded(o, level).includes('FAIL no-opt-out-link'));
    });
  }

  it('grades Limited Data Use hits WARN under standard and FAIL under strict', () => {
    const o = obs({ gpc: pass({ requests: [META_SCRIPT, metaHit('&dpo=LDU')] }) });
    assert.ok(graded(o, 'standard').includes('WARN restricted-processing-after-gpc'));
    assert.equal(g.verdictOf(g.gradeFindings(o, 'standard')), 'passed with warnings');
    assert.ok(graded(o, 'strict').includes('FAIL restricted-processing-after-gpc'));
  });

  it('grades an ad script with no hits WARN under standard and FAIL under strict', () => {
    const o = obs({ gpc: pass({ requests: [META_SCRIPT] }) });
    assert.ok(graded(o, 'standard').includes('WARN ad-script-after-gpc'));
    assert.ok(graded(o, 'strict').includes('FAIL ad-script-after-gpc'));
  });

  it('treats a missing link as INFO when no ad-tech was seen', () => {
    const o = obs({ baseline: pass({ requests: [GA] }), optOutLink: { found: false } });
    assert.ok(graded(o).includes('INFO no-opt-out-link-no-sale-seen'));
  });

  it('grades analytics after GPC INFO under standard and WARN under strict', () => {
    const o = obs({ gpc: pass({ requests: [GA] }) });
    assert.ok(graded(o, 'standard').includes('INFO analytics-after-gpc'));
    assert.ok(graded(o, 'strict').includes('WARN analytics-after-gpc'));
  });

  it('warns when the CMP did not record the GPC opt-out', () => {
    const o = obs({ gpc: pass({ privacy: { usp: '1YNN' } }) });
    assert.ok(graded(o).includes('WARN gpp-opt-out-missing'));
  });
});

describe('resolveCheckLevel', () => {
  it('reads CCPA_CHECK_LEVEL and lets the site win', () => {
    assert.deepEqual(g.resolveCheckLevel(undefined, 'strict'), { level: 'strict', source: 'CCPA_CHECK_LEVEL' });
    assert.equal(g.resolveCheckLevel('report', 'strict').level, 'report');
  });
});

describe('ccpa factory', () => {
  const entry = {
    kind: 'ccpa',
    env: 'PROD',
    url: 'https://example.com',
    locations: ['us-west-1'],
    smoke: true,
    monitor: false,
  };

  it('creates one check per location with CHECK_LOCATION set', () => {
    const [c] = tryFactory('ccpa', { ...entry, logicalId: 'cc-1' });
    assert.equal(c.logicalId, 'cc-1-us-west-1');
    assert.deepEqual([...c.locations], ['us-west-1']);
    assert.equal(c.environmentVariables.find((v) => v.key === 'CHECK_LOCATION').value, 'us-west-1');
  });

  it('rejects a non-California location', () => {
    assert.throws(() => tryFactory('ccpa', { ...entry, logicalId: 'cc-2', locations: ['eu-west-1'] }), /non-California locations: eu-west-1/);
  });

  it('does not fall back to project default locations', () => {
    const { locations: _l, ...noLocations } = entry;
    assert.throws(
      () => tryFactory('ccpa', { ...noLocations, logicalId: 'cc-3' }, { ...baseContext, defaultLocations: ['us-west-1'] }),
      /has no locations set/,
    );
  });

  it('applies overrides into CHECK_PARAMS and only passes checkLevel when set', () => {
    const [c] = tryFactory('ccpa', {
      ...entry,
      logicalId: 'cc-4',
      checkLevel: 'strict',
      overrides: { adTechDomains: { add: ['ads.example.net'], remove: ['ct.pinterest.com'] }, optOutSelectors: ['#ot-sdk-btn'] },
    });
    const params = JSON.parse(c.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value);
    assert.equal(params.checkLevel, 'strict');
    assert.ok(params.adTechDomains.includes('ads.example.net'));
    assert.ok(!params.adTechDomains.includes('ct.pinterest.com'));
    assert.deepEqual(params.optOutSelectors, ['#ot-sdk-btn']);
    assert.ok(!params.adCookieBlocklist.google_doubleclick.includes('test_cookie'));

    const [d] = tryFactory('ccpa', { ...entry, logicalId: 'cc-5' });
    assert.equal('checkLevel' in JSON.parse(d.environmentVariables.find((v) => v.key === 'CHECK_PARAMS').value), false);
  });
});

describe('ccpa schema', () => {
  it('rejects a non-California location', () => {
    const { valid } = validateConfig(configWith({
      kind: 'ccpa', logicalId: 's-1', env: 'PROD', url: 'https://example.com', locations: ['eu-west-1'], smoke: true,
    }));
    assert.equal(valid, false);
  });
});
