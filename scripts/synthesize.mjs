#!/usr/bin/env node
// Turns consumer entries into the exact JSON payloads Checkly's API takes,
// for a consumer that cannot run these factories itself.
//
//   echo '{"project":{...},"entries":[{...}]}' | node scripts/synthesize.mjs
//
// Reads one JSON document on stdin and writes one on stdout:
//
//   in   { project: ProjectBlock, defaultFrequency?, defaultLocations?, entries: Entry[] }
//   out  { payloads: [{ logicalId, kind, payload }] }
//   err  { error: string, logicalId?: string }   (exit 1)
//
// **Why this exists.** The Client Portal deploys checks by calling Checkly's
// REST API directly rather than running `checkly deploy`, and so had a second
// implementation of every factory written in C#. It drifted, expensively and
// silently: a retry policy that survived every deploy for weeks because the
// hand-written payload omitted a field the SDK sets, auth headers that
// resolved to undefined because it never sent the variable holding them, and
// a default frequency that made every check of one kind run twice as often as
// intended. `synthesize()` is the SDK's own answer to "what does Checkly
// receive for this entry", it needs no network, and it is the same code path
// `checkly deploy` uses -- so a consumer reading this output cannot disagree
// with a deploy from the CLI.
//
// Secrets: a `valueFromEnv` header is resolved from this process's own
// environment, exactly as it is under `checkly deploy`, and the factory throws
// when the variable is unset. A caller passes them in the child environment.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const jiti = createJiti(import.meta.url);

function fail(message, logicalId) {
  process.stdout.write(JSON.stringify({ error: message, ...(logicalId ? { logicalId } : {}) }));
  process.exit(1);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// The constructs refuse to instantiate outside a Checkly project, and
// PlaywrightCheck resolves its config path relative to the check file. Same
// setup the test harness uses; none of it touches the network.
async function openSession() {
  const { Project, Session } = await jiti.import('checkly/constructs');

  Session.project = new Project('portal-synthesize', { name: 'Portal' });
  Session.checkFileAbsolutePath = path.join(repoRoot, 'src', 'deploy', 'all.check.ts');
  Session.basePath = repoRoot;

  const { pathToFileURL } = await import('node:url');
  const pm = await import(pathToFileURL(path.join(
    repoRoot, 'node_modules/checkly/dist/services/check-parser/package-files/package-manager.js')).href);
  const result = await import(pathToFileURL(path.join(
    repoRoot, 'node_modules/checkly/dist/services/check-parser/package-files/result.js')).href);

  const workspace = await pm.npmPackageManager.lookupWorkspace(repoRoot);
  if (workspace) {
    Session.workspace = result.Ok(workspace);
    Session.basePath = workspace.root.path;
    Session.contextPath = workspace.root.path;
  }

  return Session;
}

const raw = await readStdin();
if (!raw.trim()) fail('No input. Expected a JSON document on stdin.');

let input;
try {
  input = JSON.parse(raw);
} catch (error) {
  fail(`Input was not valid JSON: ${error.message}`);
}

if (!Array.isArray(input.entries)) fail('Input needs an "entries" array.');

await openSession();
const { REGISTRY } = await jiti.import('../src/deploy/registry.ts');

const ctx = {
  project: input.project ?? { logicalId: 'portal', name: 'Portal' },
  defaultFrequency: input.defaultFrequency,
  defaultLocations: input.defaultLocations,
};

const payloads = [];

for (const entry of input.entries) {
  const module = REGISTRY[entry.kind];
  if (!module) fail(`Unknown kind "${entry.kind}".`, entry.logicalId);

  try {
    payloads.push({
      logicalId: entry.logicalId,
      kind: entry.kind,
      payload: module.factory(entry, ctx).synthesize(),
    });
  } catch (error) {
    fail(error.message, entry.logicalId);
  }
}

process.stdout.write(JSON.stringify({ payloads }));
