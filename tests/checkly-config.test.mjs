// Tests for src/deploy/checkly.config.ts's behaviour:
//   - When project.defaults.locations is set, cli.runLocation defaults
//     to the first entry so `checkly test` runs from the same region as
//     deployed monitors.
//   - When no project default is set, cli.runLocation is omitted so
//     Checkly falls back to its own DEFAULT_REGION.
//
// This is the bug the dxbyk pipeline hit: smoke ran from eu-central-1
// even though every monitor was scheduled in ap-southeast-2.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createJiti } from 'jiti';
import { repoRoot } from './helpers.mjs';

const tmp = os.tmpdir();
let originalEnv;

async function freshConfig() {
  const loaderUrl = path.join(repoRoot, 'src', 'deploy', 'load-config.ts');
  const configUrl = path.join(repoRoot, 'src', 'deploy', 'checkly.config.ts');
  // New jiti instance with fsCache off so the module is re-evaluated
  // for the current CHECKLY_TEMPLATES_CONFIG. (Plus we reset the cache
  // hook on load-config.ts directly for belt-and-braces.)
  const jiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false });
  const loader = await jiti.import(loaderUrl);
  loader._resetConfigCacheForTests();
  const mod = await jiti.import(configUrl);
  return mod.default;
}

beforeEach(() => {
  originalEnv = process.env.CHECKLY_TEMPLATES_CONFIG;
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.CHECKLY_TEMPLATES_CONFIG;
  else process.env.CHECKLY_TEMPLATES_CONFIG = originalEnv;
});

function writeConfig(json) {
  const file = path.join(tmp, 'checkly-config-test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.json');
  fs.writeFileSync(file, JSON.stringify(json));
  process.env.CHECKLY_TEMPLATES_CONFIG = file;
  return file;
}

describe('checkly.config.ts: cli.runLocation', () => {
  it('sets cli.runLocation to project.defaults.locations[0] when set', async () => {
    const file = writeConfig({
      project: {
        logicalId: 'p',
        name: 'P',
        defaults: { locations: ['ap-southeast-2', 'eu-central-1'] },
      },
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
    });
    const config = await freshConfig();
    assert.equal(config.cli?.runLocation, 'ap-southeast-2');
    fs.unlinkSync(file);
  });

  it('omits cli entirely when no project defaults are set', async () => {
    const file = writeConfig({
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
    });
    const config = await freshConfig();
    // cli undefined OR cli.runLocation undefined — either way, no runLocation.
    assert.equal(config.cli?.runLocation, undefined);
    fs.unlinkSync(file);
  });

  it('propagates project name + logicalId regardless', async () => {
    const file = writeConfig({
      project: {
        logicalId: 'my-project',
        name: 'My Project',
        defaults: { locations: ['us-east-1'] },
      },
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
    });
    const config = await freshConfig();
    assert.equal(config.projectName, 'My Project');
    assert.equal(config.logicalId, 'my-project');
    assert.equal(config.cli?.runLocation, 'us-east-1');
    fs.unlinkSync(file);
  });
});
