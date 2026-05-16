#!/usr/bin/env node
// Local "try a config" wrapper. Sets CHECKLY_TEMPLATES_CONFIG and forwards
// to the Checkly CLI in one of four modes:
//
//   --mode validate (default) -> loads + schema-validates the config and
//                                calls every factory. No network.
//   --mode test               -> npx checkly test (runs in Checkly cloud,
//                                no monitors persisted).
//   --mode preview            -> npx checkly deploy --preview (diff only).
//   --mode deploy             -> npx checkly deploy (actually persists).
//
// Usage:
//   node scripts/try-config.mjs                                # validate examples/consumer-checks.json
//   node scripts/try-config.mjs --mode preview                 # preview using the default config
//   node scripts/try-config.mjs --config local-testing/my.json --mode deploy
//
// `--mode test|preview|deploy` requires CHECKLY_API_KEY + CHECKLY_ACCOUNT_ID.
// See the README for the sandbox-account safety guidance.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

// Auto-load Checkly creds from local-testing/.env if it exists. Lets
// users set CHECKLY_API_KEY + CHECKLY_ACCOUNT_ID without touching their
// shell. The file is gitignored; the committed local-testing/.env.example
// documents the shape.
const envFile = path.join(repoRoot, 'local-testing', '.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
  console.log(`Loaded env from ${path.relative(process.cwd(), envFile)}.`);
}

function ensureChecklyCreds() {
  const missing = ['CHECKLY_API_KEY', 'CHECKLY_ACCOUNT_ID'].filter((k) => !process.env[k]);
  if (missing.length === 0) return;
  console.error(
    `Missing required env vars: ${missing.join(', ')}.\n` +
      `Copy local-testing/.env.example to local-testing/.env and fill in your\n` +
      `Checkly credentials, then re-run.`,
  );
  process.exit(2);
}

function parseArgs(argv) {
  const args = { mode: 'validate', config: 'examples/consumer-checks.json' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') args.mode = argv[++i];
    else if (a.startsWith('--mode=')) args.mode = a.slice('--mode='.length);
    else if (a === '--config') args.config = argv[++i];
    else if (a.startsWith('--config=')) args.config = a.slice('--config='.length);
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`try-config.mjs - local Checkly templates sandbox

Usage:
  node scripts/try-config.mjs [--mode <validate|test|preview|deploy|both>] [--config <path>]

Modes:
  validate  Load + schema-validate the config and call every factory (no network). Default.
  test      npx checkly test against entries with smoke=true (CHECKLY_PURPOSE=test). Needs creds.
  preview   npx checkly deploy --preview against entries with monitor=true. Needs creds.
  deploy    npx checkly deploy against entries with monitor=true. Persists monitors. Needs creds.
  both      Run test first (smoke gate), then deploy if it passes. Each pass filters
            by per-entry purpose. The pipeline templates use this mode.

Default config: examples/consumer-checks.json.
Drop scratch configs under local-testing/ (gitignored).`);
}

async function runValidate(configPath) {
  process.env.CHECKLY_TEMPLATES_CONFIG = configPath;
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  const { loadConsumerConfig, buildContext } = await jiti.import(
    path.join(repoRoot, 'src', 'deploy', 'load-config.ts'),
  );
  const { getModule } = await jiti.import(path.join(repoRoot, 'src', 'deploy', 'registry.ts'));

  const config = loadConsumerConfig();
  const ctx = buildContext(config);
  const purpose = process.env.CHECKLY_PURPOSE;

  const filtered = config.checks.filter((entry) => {
    if (purpose === 'test') return entry.smoke === true;
    if (purpose === 'monitor') return entry.monitor === true;
    return true;
  });

  for (const entry of filtered) {
    const mod = getModule(entry.kind);
    // Calling the factory in validate mode is normally a side-effect that
    // registers a Checkly construct. We catch construct-registration
    // failures (missing Checkly session) so validate can run with no
    // Checkly CLI present.
    try {
      mod.factory(entry, ctx);
    } catch (err) {
      // Validate runs without a Checkly CLI session, so constructs can't
      // register themselves. We swallow that specific error so factories
      // are still exercised end-to-end (frequency / tags / params build).
      if (!/outside a Checkly CLI project/i.test(err?.message ?? '')) throw err;
    }
  }
  const purposeNote = purpose ? ` for CHECKLY_PURPOSE=${purpose}` : '';
  console.log(
    `OK - validated ${configPath} (${filtered.length}/${config.checks.length} entries${purposeNote}; ${config.project.logicalId}).`,
  );
}

// CHECKLY_PURPOSE tells all.check.ts which entries to register. `test`
// includes entries with `smoke: true`; `monitor` includes those with
// `monitor: true`.
const CHECKLY_PURPOSE_BY_MODE = {
  test: 'test',
  preview: 'monitor',
  deploy: 'monitor',
};

function runChecklyCli(mode, configPath) {
  const env = {
    ...process.env,
    CHECKLY_TEMPLATES_CONFIG: configPath,
    CHECKLY_PURPOSE: CHECKLY_PURPOSE_BY_MODE[mode],
  };
  const args = (() => {
    switch (mode) {
      case 'test':
        return ['checkly', 'test'];
      case 'preview':
        return ['checkly', 'deploy', '--preview'];
      case 'deploy':
        return ['checkly', 'deploy', '--force'];
      default:
        throw new Error(`Unknown mode "${mode}"`);
    }
  })();

  const cwd = path.join(repoRoot, 'src', 'deploy');
  return new Promise((resolve) => {
    const child = spawn('npx', args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function runBoth(configPath) {
  // Run smoke and monitor independently. Smoke findings are diagnostic
  // and don't gate deployment — monitors deploy even when smoke fails.
  // The overall exit code reflects the worst outcome of the two passes.
  const testCode = await runChecklyCli('test', configPath);
  if (testCode !== 0) {
    console.error(`\nSmoke pass exited ${testCode} (findings present). Proceeding with monitor deploy.`);
  }
  const deployCode = await runChecklyCli('deploy', configPath);
  process.exit(Math.max(testCode, deployCode));
}

const opts = parseArgs(process.argv.slice(2));
const configAbs = path.resolve(process.cwd(), opts.config);
if (!fs.existsSync(configAbs)) {
  console.error(`Config not found at ${configAbs}.`);
  process.exit(2);
}

if (opts.mode === 'validate') {
  await runValidate(configAbs);
} else if (opts.mode === 'both') {
  ensureChecklyCreds();
  await runBoth(configAbs);
} else if (['test', 'preview', 'deploy'].includes(opts.mode)) {
  ensureChecklyCreds();
  const code = await runChecklyCli(opts.mode, configAbs);
  process.exit(code);
} else {
  console.error(`Unknown --mode "${opts.mode}". See --help.`);
  process.exit(2);
}
