#!/usr/bin/env node
// Reads a consumer config file and decides whether any of its checks
// need Playwright (Chromium) installed. Used by the pipeline templates
// to skip a slow install step for API-only configs.
//
// Usage:
//   node scripts/detect-playwright.mjs <path-to-config.json> [--format=ado|gha|stdout]
//
//   ado    -> "##vso[task.setvariable variable=needsPlaywright]true|false"
//   gha    -> appends "needs-playwright=true|false" to $GITHUB_OUTPUT
//   stdout -> prints "true" or "false" (default)

import fs from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: detect-playwright.mjs <config-path> [--format=ado|gha|stdout]');
  process.exit(2);
}

const configPath = path.resolve(process.cwd(), args[0]);
const format = (args.find((a) => a.startsWith('--format='))?.split('=')[1] ?? 'stdout');

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

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const jiti = createJiti(import.meta.url);
const { hasPlaywrightKinds } = await jiti.import(
  path.resolve(here, '..', 'src', 'deploy', 'registry.ts'),
);

const kinds = config.checks.map((c) => c.kind);
const result = hasPlaywrightKinds(kinds);

switch (format) {
  case 'ado':
    console.log(`##vso[task.setvariable variable=needsPlaywright]${result}`);
    break;
  case 'gha': {
    const out = process.env.GITHUB_OUTPUT;
    if (!out) {
      console.error('GITHUB_OUTPUT env var is not set; cannot write output.');
      process.exit(2);
    }
    fs.appendFileSync(out, `needs-playwright=${result}\n`);
    break;
  }
  default:
    process.stdout.write(`${result}\n`);
}
