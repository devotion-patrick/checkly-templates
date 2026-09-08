#!/usr/bin/env node
// Runs the Playwright-based check kinds (gdpr, xpath-spa, launch-readiness,
// restricted-admin) directly via `npx playwright test` — no Checkly
// account, API key, or cloud test session, and no import of the
// `checkly` package at all.
//
// Each config entry becomes one local `playwright test` invocation, with
// CHECK_KIND / CHECK_TARGET_URL / CHECK_PARAMS set the same way Checkly's
// PlaywrightCheck construct would set them for a real deploy — built by
// each kind's env.ts (a small pure function shared with the Checkly-backed
// factory.ts), so this runner and apps/checkly-runner can't drift apart on
// what CHECK_PARAMS looks like. restricted-admin's env.ts itself delegates
// to launch-readiness's — it's a thin preset over the same spec, not a
// second copy of the logic — so its entries run CHECK_KIND=launch-readiness
// under the hood.
//
// The ApiCheck kinds (uptime-ssl, redirect, dotnet-health, xpath,
// custom-api) aren't Playwright specs — they're Checkly's own
// request/assertion DSL (or, for custom-api, a user script run as a
// teardownScript), which only executes inside Checkly's infrastructure.
// Entries of those kinds are reported as skipped, not run.
//
//   node run.mjs                          # every smoke:true entry in the default config
//   node run.mjs --grep launch-readiness  # only entries whose kind or logicalId matches
//   CHECKLY_TEMPLATES_CONFIG=configs/my-site.json node run.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createJiti } from 'jiti';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const jiti = createJiti(import.meta.url);

// Only these kinds have a real, self-contained Playwright spec under
// src/checks/<kind>/__checks__ plus a checkly-free env.ts. Every other
// registered kind is a Checkly ApiCheck construct, out of scope here.
const PLAYWRIGHT_KINDS = ['gdpr', 'xpath-spa', 'launch-readiness', 'restricted-admin'];

function envModulePath(kind) {
  return path.join(repoRoot, 'src', 'checks', kind, 'env.ts');
}

// Configs are shared with apps/checkly-runner rather than duplicated —
// point CHECKLY_TEMPLATES_CONFIG elsewhere to use a different one.
const defaultConfigPath = path.join(repoRoot, 'apps', 'checkly-runner', 'configs', '_examples.json');
const configPath = process.env.CHECKLY_TEMPLATES_CONFIG
  ? path.resolve(process.cwd(), process.env.CHECKLY_TEMPLATES_CONFIG)
  : defaultConfigPath;

if (!fs.existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const schemaPath = path.join(repoRoot, 'src', 'deploy', 'schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(config)) {
  console.error(`${configPath} failed schema validation:`);
  for (const e of validate.errors ?? []) {
    console.error(`  - ${e.instancePath || '<root>'}: ${e.message}`);
  }
  process.exit(1);
}

const grepIdx = process.argv.indexOf('--grep');
const grep = grepIdx !== -1 ? process.argv[grepIdx + 1] : null;

let ran = 0;
let failed = 0;
let skippedNonPlaywright = 0;
let skippedGrep = 0;

for (const entry of config.checks) {
  if (entry.smoke !== true) continue;

  if (grep && !entry.kind.includes(grep) && !entry.logicalId.includes(grep)) {
    skippedGrep++;
    continue;
  }

  if (!PLAYWRIGHT_KINDS.includes(entry.kind)) {
    skippedNonPlaywright++;
    console.log(
      `skip  ${entry.logicalId} (kind "${entry.kind}" is a Checkly ApiCheck, not a Playwright spec — run it via apps/checkly-runner instead)`,
    );
    continue;
  }

  const { buildCheckEnv } = await jiti.import(envModulePath(entry.kind));
  const env = buildCheckEnv(entry);

  console.log(`\n=== ${entry.logicalId} (${entry.kind}) — ${entry.url} ===`);
  const result = spawnSync('npx', ['playwright', 'test'], {
    cwd: here,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });

  ran++;
  if (result.status !== 0) failed++;
}

console.log(
  `\n${ran} run, ${failed} failed, ${skippedNonPlaywright} skipped (non-Playwright kind)` +
    (grep ? `, ${skippedGrep} skipped (--grep "${grep}")` : '') +
    '.',
);
process.exit(failed > 0 ? 1 : 0);
