// loadConsumerConfig() error paths. Every failure produces a clear
// human-readable error rather than a stack trace; consumers see these
// in their pipeline log on a bad config.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJiti } from 'jiti';
import { repoRoot } from './helpers.mjs';

const jiti = createJiti(import.meta.url);
const loader = await jiti.import(path.join(repoRoot, 'src', 'deploy', 'load-config.ts'));

// load-config.ts caches the parsed config in module-local state. We
// reset it between tests via the exported `_resetConfigCacheForTests`
// hook so each test starts with a clean cache.
async function freshLoader() {
  loader._resetConfigCacheForTests();
  return loader;
}

const tmp = os.tmpdir();
let originalEnv;

beforeEach(() => {
  originalEnv = process.env.CHECKLY_TEMPLATES_CONFIG;
  delete process.env.CHECKLY_TEMPLATES_CONFIG;
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.CHECKLY_TEMPLATES_CONFIG;
  else process.env.CHECKLY_TEMPLATES_CONFIG = originalEnv;
});

describe('loadConsumerConfig: missing env var', () => {
  it('throws with a message pointing at CHECKLY_TEMPLATES_CONFIG', async () => {
    const { loadConsumerConfig } = await freshLoader();
    assert.throws(loadConsumerConfig, /CHECKLY_TEMPLATES_CONFIG is not set/);
  });
});

describe('loadConsumerConfig: nonexistent file', () => {
  it('throws with the resolved absolute path so the operator can fix the var', async () => {
    process.env.CHECKLY_TEMPLATES_CONFIG = path.join(tmp, 'does-not-exist-' + Date.now() + '.json');
    const { loadConsumerConfig } = await freshLoader();
    assert.throws(loadConsumerConfig, /no file exists/);
  });
});

describe('loadConsumerConfig: malformed JSON', () => {
  it('throws with a JSON-parse hint', async () => {
    const file = path.join(tmp, 'malformed-' + Date.now() + '.json');
    fs.writeFileSync(file, '{ this is not json ::: }');
    process.env.CHECKLY_TEMPLATES_CONFIG = file;
    const { loadConsumerConfig } = await freshLoader();
    assert.throws(loadConsumerConfig, /Failed to parse JSON/);
    fs.unlinkSync(file);
  });
});

describe('loadConsumerConfig: schema-invalid config', () => {
  it('throws and aggregates every validation error', async () => {
    const file = path.join(tmp, 'invalid-' + Date.now() + '.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        project: { name: 'X' }, // missing logicalId
        checks: [
          {
            kind: 'uptime-ssl',
            // missing logicalId, env, url, smoke, monitor
          },
        ],
      }),
    );
    process.env.CHECKLY_TEMPLATES_CONFIG = file;
    const { loadConsumerConfig } = await freshLoader();
    assert.throws(loadConsumerConfig, (err) => {
      assert.match(err.message, /failed schema validation/);
      // The aggregation should mention multiple distinct issues, not just one.
      const bulletLines = err.message.split('\n').filter((l) => l.trim().startsWith('-'));
      assert.ok(bulletLines.length >= 2, `expected multiple error bullets, got ${bulletLines.length}`);
      return true;
    });
    fs.unlinkSync(file);
  });

  it('rejects a config whose entry sets neither smoke nor monitor', async () => {
    const file = path.join(tmp, 'no-purpose-' + Date.now() + '.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        project: { logicalId: 'p', name: 'P' },
        checks: [
          {
            kind: 'uptime-ssl',
            logicalId: 'u',
            env: 'PROD',
            url: 'https://example.com',
          },
        ],
      }),
    );
    process.env.CHECKLY_TEMPLATES_CONFIG = file;
    const { loadConsumerConfig } = await freshLoader();
    assert.throws(loadConsumerConfig, /failed schema validation/);
    fs.unlinkSync(file);
  });
});

describe('loadConsumerConfig: happy path', () => {
  it('returns the parsed config; buildContext leaves defaults undefined when project did not set them', async () => {
    const file = path.join(tmp, 'happy-' + Date.now() + '.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        project: { logicalId: 'p', name: 'P' },
        checks: [
          {
            kind: 'uptime-ssl',
            logicalId: 'u',
            env: 'PROD',
            url: 'https://example.com',
            smoke: true,
            monitor: false,
          },
        ],
      }),
    );
    process.env.CHECKLY_TEMPLATES_CONFIG = file;
    const { loadConsumerConfig, buildContext } = await freshLoader();
    const config = loadConsumerConfig();
    assert.equal(config.project.logicalId, 'p');
    assert.equal(config.checks.length, 1);
    const ctx = buildContext(config);
    // No project-level defaults set → ctx.defaultFrequency / defaultLocations
    // are undefined. Factories fall through to kind-level defaults from there.
    assert.equal(ctx.defaultFrequency, undefined);
    assert.equal(ctx.defaultLocations, undefined);
    fs.unlinkSync(file);
  });

  it('honours project.defaults.frequency + locations in the built context', async () => {
    const file = path.join(tmp, 'defaults-' + Date.now() + '.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        project: {
          logicalId: 'p',
          name: 'P',
          defaults: { frequency: 'EVERY_5M', locations: ['ap-southeast-2', 'us-east-1'] },
        },
        checks: [
          {
            kind: 'uptime-ssl',
            logicalId: 'u',
            env: 'PROD',
            url: 'https://example.com',
            smoke: false,
            monitor: true,
          },
        ],
      }),
    );
    process.env.CHECKLY_TEMPLATES_CONFIG = file;
    const { loadConsumerConfig, buildContext } = await freshLoader();
    const ctx = buildContext(loadConsumerConfig());
    assert.equal(ctx.defaultFrequency, 'EVERY_5M');
    assert.deepEqual(ctx.defaultLocations, ['ap-southeast-2', 'us-east-1']);
    fs.unlinkSync(file);
  });
});
