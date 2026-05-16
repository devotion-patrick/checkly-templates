#!/usr/bin/env node
// Reads a consumer config file and emits flags the pipeline templates
// use to gate optional steps:
//
//   - needs-playwright : any entry uses a Playwright-backed kind (so we
//                        need to install Chromium before deploying).
//   - has-smoke        : any entry has `smoke: true` (run smoke pass).
//   - has-monitor      : any entry has `monitor: true` (run monitor pass).
//
// Usage:
//   node scripts/inspect-config.mjs <path-to-config.json> [--format=ado|gha|stdout]
//
//   ado    -> "##vso[task.setvariable variable=<key>]<value>" for each flag
//   gha    -> appends "<key>=<value>" lines to $GITHUB_OUTPUT
//   stdout -> prints each "<key>=<value>" line (handy for local debugging)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: inspect-config.mjs <config-path> [--format=ado|gha|stdout]');
  process.exit(2);
}

const configPath = path.resolve(process.cwd(), args[0]);
const format = args.find((a) => a.startsWith('--format='))?.split('=')[1] ?? 'stdout';

if (!fs.existsSync(configPath)) {
  console.error(`config not found: ${configPath}`);
  process.exit(2);
}

const raw = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(raw);
if (!Array.isArray(config?.checks)) {
  console.error('config.checks is not an array');
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url);
const { hasPlaywrightKinds } = await jiti.import(
  path.resolve(here, '..', 'src', 'deploy', 'registry.ts'),
);

const kinds = config.checks.map((c) => c.kind);

// ADO variables are camelCase by convention; GHA outputs are kebab-case.
// The flags are defined once in the camelCase shape and keyed appropriately
// at emit time.
const flags = {
  needsPlaywright: hasPlaywrightKinds(kinds),
  hasSmoke: config.checks.some((c) => c.smoke === true),
  hasMonitor: config.checks.some((c) => c.monitor === true),
};

const toKebab = (k) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

switch (format) {
  case 'ado':
    for (const [k, v] of Object.entries(flags)) {
      console.log(`##vso[task.setvariable variable=${k}]${v}`);
    }
    break;
  case 'gha': {
    const out = process.env.GITHUB_OUTPUT;
    if (!out) {
      console.error('GITHUB_OUTPUT env var is not set; cannot write output.');
      process.exit(2);
    }
    const lines = Object.entries(flags)
      .map(([k, v]) => `${toKebab(k)}=${v}`)
      .join('\n');
    fs.appendFileSync(out, lines + '\n');
    break;
  }
  default:
    for (const [k, v] of Object.entries(flags)) {
      process.stdout.write(`${toKebab(k)}=${v}\n`);
    }
}
