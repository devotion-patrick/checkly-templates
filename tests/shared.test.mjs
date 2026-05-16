// Pure helpers in src/shared/. Tested directly so a regression in
// any of these surfaces here rather than through a confusing factory
// output assertion further down the chain.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
import { repoRoot } from './helpers.mjs';

const jiti = createJiti(import.meta.url);
const tags = await jiti.import(path.join(repoRoot, 'src', 'shared', 'tags.ts'));
const frequency = await jiti.import(path.join(repoRoot, 'src', 'shared', 'frequency.ts'));
const presets = await jiti.import(path.join(repoRoot, 'src', 'shared', 'presets', 'gdpr-eu-uk-ca.ts'));

describe('buildAutoTags', () => {
  it('emits bare `source:checkly-templates` when no prefix is set', () => {
    const out = tags.buildAutoTags({
      project: { logicalId: 'p', name: 'P' },
      entry: { kind: 'gdpr', env: 'PROD' },
    });
    assert.deepEqual(out, ['source:checkly-templates']);
  });

  it('emits prefixed source + env + kind when prefix is set but codename is not', () => {
    const out = tags.buildAutoTags({
      project: { logicalId: 'p', name: 'P', tagPrefix: 'acme' },
      entry: { kind: 'gdpr', env: 'PROD' },
    });
    assert.deepEqual(out, ['acme.source:checkly-templates', 'acme.env:PROD', 'acme.kind:gdpr']);
  });

  it('emits full triple plus source when prefix AND codename are set', () => {
    const out = tags.buildAutoTags({
      project: { logicalId: 'p', name: 'P', tagPrefix: 'acme', codename: 'acme-app' },
      entry: { kind: 'xpath', env: 'UAT' },
    });
    assert.deepEqual(out, [
      'acme.source:checkly-templates',
      'acme.app:acme-app',
      'acme.env:UAT',
      'acme.kind:xpath',
    ]);
  });

  it('trims whitespace-only prefixes back to no-prefix mode', () => {
    const out = tags.buildAutoTags({
      project: { logicalId: 'p', name: 'P', tagPrefix: '   ' },
      entry: { kind: 'gdpr', env: 'PROD' },
    });
    assert.deepEqual(out, ['source:checkly-templates']);
  });
});

describe('mergeTags', () => {
  it('returns a deduped union preserving first-seen order', () => {
    const out = tags.mergeTags(['a', 'b'], ['c', 'a'], ['d', 'b', 'e']);
    assert.deepEqual(out, ['a', 'b', 'c', 'd', 'e']);
  });

  it('handles undefined inputs cleanly', () => {
    const out = tags.mergeTags(['a'], undefined, ['b']);
    assert.deepEqual(out, ['a', 'b']);
  });

  it('returns [] when all inputs are empty / undefined', () => {
    assert.deepEqual(tags.mergeTags(), []);
    assert.deepEqual(tags.mergeTags(undefined, []), []);
  });

  it('keeps the auto-emitted source tag at the head when called via the standard pattern', () => {
    const auto = ['acme.source:checkly-templates', 'acme.kind:gdpr'];
    const project = ['managed-by:checkly-templates'];
    const entry = ['acme.kind:gdpr', 'team:platform']; // overlap on .kind:
    const out = tags.mergeTags(auto, project, entry);
    assert.equal(out[0], 'acme.source:checkly-templates');
    // Overlap dedupes; entry-only tags still land.
    assert.ok(out.includes('team:platform'));
    assert.ok(out.includes('managed-by:checkly-templates'));
    // No duplicates anywhere.
    assert.equal(new Set(out).size, out.length);
  });
});

describe('parseFrequency', () => {
  it('maps every published name to a Checkly Frequency value', () => {
    for (const name of frequency.FREQUENCY_NAMES) {
      const v = frequency.parseFrequency(name);
      // Checkly's Frequency objects expose a `frequency` numeric field; we
      // don't depend on the exact representation but assert it's a defined,
      // non-null value.
      assert.notEqual(v, undefined, `parseFrequency(${name}) returned undefined`);
      assert.notEqual(v, null);
    }
  });

  it('throws on an unknown frequency name', () => {
    assert.throws(() => frequency.parseFrequency('EVERY_500S'), /Unknown frequency "EVERY_500S"/);
  });

  it('exposes the canonical name list', () => {
    assert.ok(frequency.FREQUENCY_NAMES.includes('EVERY_5M'));
    assert.ok(frequency.FREQUENCY_NAMES.includes('EVERY_24H'));
    // Ordered from short to long for nicer IDE auto-complete.
    const idxShort = frequency.FREQUENCY_NAMES.indexOf('EVERY_10S');
    const idxLong = frequency.FREQUENCY_NAMES.indexOf('EVERY_24H');
    assert.ok(idxShort < idxLong, 'expected EVERY_10S to come before EVERY_24H');
  });
});

describe('gdpr-eu-uk-ca preset', () => {
  it('includes core EU member states + GB in restrictedRegions', () => {
    for (const code of ['DE', 'FR', 'NL', 'GB', 'IE']) {
      assert.ok(presets.restrictedRegions.has(code), `expected ${code} in restrictedRegions`);
    }
  });

  it('flags US-CA but not other US states', () => {
    assert.ok(presets.restrictedRegions.has('US-CA'));
    assert.ok(!presets.restrictedRegions.has('US-NY'));
    assert.ok(!presets.restrictedRegions.has('US'));
  });

  it('lists the standard tracking domains', () => {
    for (const d of ['google-analytics.com', 'doubleclick.net', 'connect.facebook.net']) {
      assert.ok(presets.trackingDomains.has(d), `expected ${d} in trackingDomains`);
    }
  });

  it('explicitly excludes the cookie-free YouTube variants', () => {
    assert.ok(!presets.trackingDomains.has('youtube-nocookie.com'));
    assert.ok(!presets.trackingDomains.has('ytimg.com'));
  });

  it('cookieBlocklist categories include the expected GA / Meta / LinkedIn cookies', () => {
    assert.ok(presets.cookieBlocklist.google_analytics.includes('_ga'));
    assert.ok(presets.cookieBlocklist.google_analytics.includes('_ga_*'));
    assert.ok(presets.cookieBlocklist.meta.includes('_fbp'));
    assert.ok(presets.cookieBlocklist.linkedin.includes('bcookie'));
  });
});
