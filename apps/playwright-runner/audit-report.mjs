#!/usr/bin/env node
// Runs every `launch-readiness` entry in a config through local Playwright
// (same mechanism as run.mjs — no Checkly dependency) and emits a
// structured JSON report grouped by client, matching the shape of the
// "Pre-launch check audit" Confluence page: per-URL security-header
// failures, other (content/SEO/a11y) failures, non-blocking warnings, and
// a status label for gated (CMS) endpoints.
//
//   node audit-report.mjs [--config path/to/config.json] [--concurrency N] [--out path/to/report.json]
//
// Defaults: ../checkly-runner/configs/devotion_sites-launch-readiness.json,
// concurrency 6, report.json next to this script.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createJiti } from 'jiti';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const jiti = createJiti(import.meta.url);

function argVal(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const configPath = path.resolve(
  process.cwd(),
  argVal('--config', path.join(repoRoot, 'apps', 'checkly-runner', 'configs', 'devotion_sites-launch-readiness.json')),
);
const concurrency = Number(argVal('--concurrency', '6'));
const outPath = path.resolve(process.cwd(), argVal('--out', path.join(here, 'report.json')));

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'deploy', 'schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(config)) {
  console.error(`${configPath} failed schema validation:`);
  for (const e of validate.errors ?? []) console.error(`  - ${e.instancePath || '<root>'}: ${e.message}`);
  process.exit(1);
}

const { buildCheckEnv } = await jiti.import(path.join(repoRoot, 'src', 'checks', 'launch-readiness', 'env.ts'));

const entries = config.checks.filter((e) => e.kind === 'launch-readiness' && e.smoke === true);

const SECURITY_HEADER_RE = /^Response header "(.+)" is missing\.$/;
const EXPECTED_AUTH_RE = /^Expected this endpoint to require authentication/;
const NON_200_RE = /^Returned HTTP (\d+) \(expected 200\)/;
const JS_REDIRECT_RE = /^Performed a client-side redirect/;

function classify(entry, resultLine, rawOutput) {
  const expectPublic = entry.expectPubliclyAccessible ?? true;

  if (!resultLine) {
    return {
      logicalId: entry.logicalId,
      url: entry.url,
      type: expectPublic === true ? 'Website' : 'CMS',
      status: 'scan error',
      httpStatus: null,
      securityHeaderFails: [],
      otherFails: [],
      warnings: [],
      note: rawOutput.split('\n').find((l) => /error/i.test(l))?.trim().slice(0, 300) ?? 'no LAUNCH_READINESS_RESULT line captured',
    };
  }

  const { httpStatus, findings, warnings } = resultLine;

  if (expectPublic === false) {
    // CMS/admin that must be gated. Accessibility is determined by
    // httpStatus, not by findings.length — a 2xx that turned out to be a
    // homepage-duplicate fallback (not a real login form) is downgraded
    // to a warning-only outcome in spec.ts, so findings can be empty even
    // though the endpoint is reachable.
    const isAccessible = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
    if (!isAccessible) {
      return {
        logicalId: entry.logicalId,
        url: entry.url,
        type: 'CMS',
        status: `inaccessible (${httpStatus})`,
        httpStatus,
        securityHeaderFails: [],
        otherFails: [],
        warnings: [],
      };
    }
    if (findings.some((f) => EXPECTED_AUTH_RE.test(f))) {
      return {
        logicalId: entry.logicalId,
        url: entry.url,
        type: 'CMS',
        status: 'Publicly accessible',
        httpStatus,
        securityHeaderFails: [],
        otherFails: [],
        warnings: [],
      };
    }
    if (findings.length === 0) {
      // Reachable, but not a real login form and not a hard fail — the
      // homepage-duplicate case (or any other warning-only outcome).
      return {
        logicalId: entry.logicalId,
        url: entry.url,
        type: 'CMS',
        status: 'reachable, not a CMS login (see warnings)',
        httpStatus,
        securityHeaderFails: [],
        otherFails: [],
        warnings,
      };
    }
    return {
      logicalId: entry.logicalId,
      url: entry.url,
      type: 'CMS',
      status: httpStatus && httpStatus >= 500 ? `HTTP ${httpStatus}` : `HTTP ${httpStatus ?? 'unknown'}`,
      httpStatus,
      securityHeaderFails: [],
      otherFails: findings,
      warnings,
    };
  }

  if (expectPublic === 'either') {
    // CMS/admin where public-vs-gated is a legitimate per-client choice —
    // spec.ts only ever notes a 5xx or a missing security header here.
    if (httpStatus !== null && httpStatus >= 500) {
      return {
        logicalId: entry.logicalId,
        url: entry.url,
        type: 'CMS',
        status: `HTTP ${httpStatus}`,
        httpStatus,
        securityHeaderFails: [],
        otherFails: [],
        warnings: [],
      };
    }
    const isAccessible = httpStatus !== null && httpStatus >= 200 && httpStatus < 300;
    const securityHeaderFails = [];
    for (const f of findings) {
      const m = f.match(SECURITY_HEADER_RE);
      if (m) securityHeaderFails.push(m[1]);
    }
    return {
      logicalId: entry.logicalId,
      url: entry.url,
      type: 'CMS',
      status: isAccessible ? 'public (either OK)' : `inaccessible (${httpStatus})`,
      httpStatus,
      securityHeaderFails,
      otherFails: [],
      warnings,
    };
  }

  // Website: a single "Returned HTTP xxx" or "client-side redirect" finding
  // means the audit couldn't run at all; surface it as the status instead
  // of pretending it's a normal header/content fail.
  if (findings.length === 1 && NON_200_RE.test(findings[0])) {
    const m = findings[0].match(NON_200_RE);
    return {
      logicalId: entry.logicalId,
      url: entry.url,
      type: 'Website',
      status: `HTTP ${m[1]}`,
      httpStatus,
      securityHeaderFails: [],
      otherFails: [],
      warnings: [],
    };
  }
  if (findings.length === 1 && JS_REDIRECT_RE.test(findings[0])) {
    return {
      logicalId: entry.logicalId,
      url: entry.url,
      type: 'Website',
      status: 'client-side redirect (unaudited)',
      httpStatus,
      securityHeaderFails: [],
      otherFails: [],
      warnings: [],
    };
  }

  const securityHeaderFails = [];
  const otherFails = [];
  for (const f of findings) {
    const m = f.match(SECURITY_HEADER_RE);
    if (m) securityHeaderFails.push(m[1]);
    else otherFails.push(f);
  }

  return {
    logicalId: entry.logicalId,
    url: entry.url,
    type: 'Website',
    status: findings.length === 0 ? 'pass' : 'fail',
    httpStatus,
    securityHeaderFails,
    otherFails,
    warnings,
  };
}

function runOne(entry) {
  return new Promise((resolve) => {
    const env = buildCheckEnv(entry);
    const child = spawn('npx', ['playwright', 'test'], {
      cwd: here,
      shell: process.platform === 'win32',
      env: { ...process.env, ...env },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('close', () => {
      const match = out.match(/LAUNCH_READINESS_RESULT (\{.*\})/);
      const resultLine = match ? JSON.parse(match[1]) : null;
      const result = classify(entry, resultLine, out);
      console.log(`${result.status.padEnd(28)} ${entry.logicalId}`);
      resolve(result);
    });
  });
}

async function runPool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runNext() {
    const i = next++;
    if (i >= items.length) return;
    results[i] = await worker(items[i]);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, runNext));
  return results;
}

console.log(`Running ${entries.length} launch-readiness entries at concurrency ${concurrency}...\n`);
const results = await runPool(entries, concurrency, runOne);

fs.writeFileSync(outPath, JSON.stringify(results, null, 2) + '\n');
console.log(`\nWrote ${results.length} results to ${outPath}`);

const scanErrors = results.filter((r) => r.status === 'scan error').length;
const publiclyAccessible = results.filter((r) => r.status === 'Publicly accessible').length;
const fails = results.filter((r) => r.status === 'fail').length;
console.log(
  `${results.length} total — ${fails} website fails, ${publiclyAccessible} CMS publicly accessible, ${scanErrors} scan errors.`,
);
