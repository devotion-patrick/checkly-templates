// Subprocess tests for the two scripts that run inside the consumer
// pipeline. These are what the POSIX path-handling bug lived inside;
// asserting from a subprocess catches anything platform-specific (file
// URL handling, cwd resolution, exit codes, stdout vs stderr).

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repoRoot } from './helpers.mjs';

const inspect = path.join(repoRoot, 'scripts', 'inspect-config.mjs');
const buildSchema = path.join(repoRoot, 'src', 'deploy', 'build-schema.mjs');
const tryConfig = path.join(repoRoot, 'scripts', 'try-config.mjs');
const example = path.join(repoRoot, 'examples', 'consumer-checks.json');

function run(args, env = {}) {
  return spawnSync('node', args, {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    cwd: repoRoot,
  });
}

const tmp = os.tmpdir();

let fixtureSmokeOnly;
let fixtureMonitorOnly;
let fixtureApiOnly;
let fixturePlaywright;

before(() => {
  const example = JSON.parse(fs.readFileSync(path.join(repoRoot, 'examples', 'consumer-checks.json'), 'utf8'));

  fixtureSmokeOnly = path.join(tmp, 'fixture-smoke-only-' + Date.now() + '.json');
  fs.writeFileSync(
    fixtureSmokeOnly,
    JSON.stringify({
      ...example,
      checks: example.checks.map((c) => ({ ...c, smoke: true, monitor: false })),
    }),
  );

  fixtureMonitorOnly = path.join(tmp, 'fixture-monitor-only-' + Date.now() + '.json');
  fs.writeFileSync(
    fixtureMonitorOnly,
    JSON.stringify({
      ...example,
      checks: example.checks.map((c) => ({ ...c, smoke: false, monitor: true })),
    }),
  );

  const PLAYWRIGHT_KINDS = new Set(['gdpr', 'xpath-spa', 'launch-readiness', 'restricted-admin']);

  fixtureApiOnly = path.join(tmp, 'fixture-api-only-' + Date.now() + '.json');
  fs.writeFileSync(
    fixtureApiOnly,
    JSON.stringify({
      ...example,
      checks: example.checks.filter((c) => !PLAYWRIGHT_KINDS.has(c.kind)),
    }),
  );

  fixturePlaywright = path.join(tmp, 'fixture-playwright-' + Date.now() + '.json');
  fs.writeFileSync(
    fixturePlaywright,
    JSON.stringify({
      ...example,
      checks: example.checks.filter((c) => PLAYWRIGHT_KINDS.has(c.kind)),
    }),
  );
});

describe('inspect-config.mjs (subprocess)', () => {
  it('exits 0 and emits all three flags for a healthy config (stdout)', () => {
    const r = run([inspect, example]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /needs-playwright=true/);
    assert.match(r.stdout, /has-smoke=true/);
    assert.match(r.stdout, /has-monitor=true/);
  });

  it('emits needs-playwright=false for an ApiCheck-only config', () => {
    const r = run([inspect, fixtureApiOnly]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /needs-playwright=false/);
  });

  it('emits needs-playwright=true for a Playwright-only config', () => {
    const r = run([inspect, fixturePlaywright]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /needs-playwright=true/);
  });

  it('emits has-monitor=false for a smoke-only config', () => {
    const r = run([inspect, fixtureSmokeOnly]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /has-smoke=true/);
    assert.match(r.stdout, /has-monitor=false/);
  });

  it('emits has-smoke=false for a monitor-only config', () => {
    const r = run([inspect, fixtureMonitorOnly]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /has-smoke=false/);
    assert.match(r.stdout, /has-monitor=true/);
  });

  it('--format=ado emits ##vso[task.setvariable] lines (camelCase variable names)', () => {
    const r = run([inspect, example, '--format=ado']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /##vso\[task\.setvariable variable=needsPlaywright\](true|false)/);
    assert.match(r.stdout, /##vso\[task\.setvariable variable=hasSmoke\](true|false)/);
    assert.match(r.stdout, /##vso\[task\.setvariable variable=hasMonitor\](true|false)/);
  });

  it('--format=gha writes kebab-case key=value lines into $GITHUB_OUTPUT', () => {
    const outFile = path.join(tmp, 'gha-out-' + Date.now() + '.txt');
    fs.writeFileSync(outFile, '');
    const r = run([inspect, example, '--format=gha'], { GITHUB_OUTPUT: outFile });
    assert.equal(r.status, 0, r.stderr);
    const written = fs.readFileSync(outFile, 'utf8');
    assert.match(written, /needs-playwright=true/);
    assert.match(written, /has-smoke=true/);
    assert.match(written, /has-monitor=true/);
    fs.unlinkSync(outFile);
  });

  it('--format=gha without $GITHUB_OUTPUT set exits non-zero with a clear message', () => {
    const r = run([inspect, example, '--format=gha'], { GITHUB_OUTPUT: '' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /GITHUB_OUTPUT/);
  });

  it('exits non-zero with usage when no config arg is given', () => {
    const r = run([inspect]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Usage:/);
  });

  it('exits non-zero when the config file does not exist', () => {
    const r = run([inspect, path.join(tmp, 'definitely-does-not-exist.json')]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /config not found/);
  });

  it('exits non-zero when checks is not an array', () => {
    const bad = path.join(tmp, 'bad-checks-' + Date.now() + '.json');
    fs.writeFileSync(bad, JSON.stringify({ project: {}, checks: 'not-an-array' }));
    const r = run([inspect, bad]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /checks is not an array/);
    fs.unlinkSync(bad);
  });
});

describe('build-schema.mjs (subprocess)', () => {
  it('--check exits 0 when schema.json on disk matches generator output', () => {
    const r = run([buildSchema, '--check']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /up to date/);
  });
});

describe('try-config.mjs (subprocess)', () => {
  // The example config's dotnet-health entry uses valueFromEnv: HEALTH_KEY
  // to demonstrate the secret-passthrough pattern. Subprocess tests of the
  // validate flow need that env var set, just like a real pipeline would.
  const exampleEnv = { HEALTH_KEY: 'ci-test-fixture-value' };

  it('--mode validate against the example exits 0', () => {
    const r = run([tryConfig, '--mode', 'validate', '--config', example], exampleEnv);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /OK - validated/);
  });

  it('--mode validate honours CHECKLY_PURPOSE=test (filters down to smoke entries)', () => {
    const r = run([tryConfig, '--mode', 'validate', '--config', example], { ...exampleEnv, CHECKLY_PURPOSE: 'test' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // Example has 9 entries; 8 with smoke=true (uptime-ssl is monitor-only).
    assert.match(r.stdout, /8\/9 entries for CHECKLY_PURPOSE=test/);
  });

  it('--mode validate honours CHECKLY_PURPOSE=monitor', () => {
    const r = run([tryConfig, '--mode', 'validate', '--config', example], { ...exampleEnv, CHECKLY_PURPOSE: 'monitor' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // Example has 3 monitor=true entries.
    assert.match(r.stdout, /3\/9 entries for CHECKLY_PURPOSE=monitor/);
  });

  it('--mode validate fails clearly when a header valueFromEnv var is missing', () => {
    // No HEALTH_KEY in env — the factory should throw with the dotnet-health
    // entry's logicalId. Build a clean env without HEALTH_KEY since the test
    // harness inherits from process.env (which other tests may have set).
    const cleanEnv = { ...process.env };
    delete cleanEnv.HEALTH_KEY;
    const r = spawnSync('node', [tryConfig, '--mode', 'validate', '--config', example], {
      env: cleanEnv,
      encoding: 'utf8',
      cwd: repoRoot,
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /acme-api-prod-health.+HEALTH_KEY.+not set in the deploy environment/s);
  });

  it('exits non-zero when the config path does not exist', () => {
    const r = run([tryConfig, '--mode', 'validate', '--config', path.join(tmp, 'nope.json')]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Config not found/);
  });
});
