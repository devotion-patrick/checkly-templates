// Helpers shared by the gdpr and ccpa specs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
import { repoRoot } from './helpers.mjs';

const jiti = createJiti(import.meta.url);
const c = await jiti.import(path.join(repoRoot, 'src', 'checks', '_privacy', 'common.ts'));

describe('matchDomain', () => {
  it('matches the entry itself and its subdomains', () => {
    assert.equal(c.matchDomain('bat.bing.com', ['bat.bing.com']), 'bat.bing.com');
    assert.equal(c.matchDomain('region1.google-analytics.com', ['google-analytics.com']), 'google-analytics.com');
  });

  it('does not match a sibling or a lookalike', () => {
    assert.equal(c.matchDomain('www.bing.com', ['bat.bing.com']), null);
    assert.equal(c.matchDomain('notfacebook.com', ['facebook.com']), null);
  });
});

describe('parseGoogleConsentSignal', () => {
  it('reads ad_user_data and ad_personalization from gcd', () => {
    const s = c.parseGoogleConsentSignal('https://www.google.com/pagead/1p-conversion?gcd=13r3r3p2p5l1');
    assert.equal(s.adStorage, 'granted');
    assert.equal(s.adUserData, 'denied');
    assert.equal(s.adPersonalization, 'denied');
  });

  it('takes ad and analytics storage from gcs when both are present', () => {
    const s = c.parseGoogleConsentSignal('https://x.google-analytics.com/g/collect?gcs=G100&gcd=13v3v3v2v5l1');
    assert.equal(s.adStorage, 'denied');
    assert.equal(s.adUserData, 'granted');
  });
});

describe('resolveCheckLevel', () => {
  it('names the env var it read', () => {
    assert.deepEqual(c.resolveCheckLevel(undefined, 'strict', 'CCPA_CHECK_LEVEL'), {
      level: 'strict',
      source: 'CCPA_CHECK_LEVEL',
    });
    assert.throws(() => c.resolveCheckLevel(undefined, 'x', 'CCPA_CHECK_LEVEL'), /CCPA_CHECK_LEVEL="x"/);
  });
});
