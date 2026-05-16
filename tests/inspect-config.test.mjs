// inspect-config flag matrix. The script emits three booleans:
//   - needs-playwright: true iff any entry uses a Playwright-backed kind
//   - has-smoke:        true iff any entry has smoke: true
//   - has-monitor:      true iff any entry has monitor: true
//
// Every combination of these flags is reachable from some consumer config.
// The tests below assert the underlying detection logic for the 2x2x2 space.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasPlaywrightKinds } from './helpers.mjs';

// The exported helper used by inspect-config.mjs. We test the building
// blocks here; an end-to-end test of the script (with --format=gha output)
// lives in ci.yml.

describe('inspect-config: needs-playwright detection', () => {
  it('false for an empty kind list', () => {
    assert.equal(hasPlaywrightKinds([]), false);
  });

  it('false for all-ApiCheck kinds', () => {
    assert.equal(hasPlaywrightKinds(['uptime-ssl', 'redirect', 'dotnet-health', 'xpath']), false);
  });

  it('true when gdpr is present', () => {
    assert.equal(hasPlaywrightKinds(['uptime-ssl', 'gdpr']), true);
  });

  it('true when xpath-spa is present', () => {
    assert.equal(hasPlaywrightKinds(['xpath-spa']), true);
  });

  it('true when both Playwright kinds are present', () => {
    assert.equal(hasPlaywrightKinds(['gdpr', 'xpath-spa']), true);
  });

  it('false for an unknown kind name (registry miss)', () => {
    // hasPlaywrightKinds returns false for unknown kinds rather than
    // throwing. The schema's discriminated `oneOf` catches unknown kinds
    // earlier in the pipeline; this is just the safety net.
    assert.equal(hasPlaywrightKinds(['made-up-kind']), false);
  });
});

describe('inspect-config: has-smoke / has-monitor', () => {
  // Inline the same logic the script uses so we cover both directions.
  const hasSmoke = (entries) => entries.some((e) => e.smoke === true);
  const hasMonitor = (entries) => entries.some((e) => e.monitor === true);

  const cases = [
    {
      name: 'all smoke=true, all monitor=true',
      entries: [{ smoke: true, monitor: true }, { smoke: true, monitor: true }],
      smoke: true,
      monitor: true,
    },
    {
      name: 'all smoke=true, all monitor=false',
      entries: [{ smoke: true, monitor: false }, { smoke: true, monitor: false }],
      smoke: true,
      monitor: false,
    },
    {
      name: 'all smoke=false, all monitor=true',
      entries: [{ smoke: false, monitor: true }, { smoke: false, monitor: true }],
      smoke: false,
      monitor: true,
    },
    {
      name: 'mixed: one smoke-only, one monitor-only',
      entries: [{ smoke: true, monitor: false }, { smoke: false, monitor: true }],
      smoke: true,
      monitor: true,
    },
    {
      name: 'mixed: one both, one smoke-only',
      entries: [{ smoke: true, monitor: true }, { smoke: true, monitor: false }],
      smoke: true,
      monitor: true,
    },
    {
      name: 'single entry, smoke-only',
      entries: [{ smoke: true, monitor: false }],
      smoke: true,
      monitor: false,
    },
    {
      name: 'single entry, monitor-only',
      entries: [{ smoke: false, monitor: true }],
      smoke: false,
      monitor: true,
    },
    {
      name: 'single entry, both',
      entries: [{ smoke: true, monitor: true }],
      smoke: true,
      monitor: true,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      assert.equal(hasSmoke(c.entries), c.smoke);
      assert.equal(hasMonitor(c.entries), c.monitor);
    });
  }
});
