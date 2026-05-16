#!/usr/bin/env node
// Writes src/deploy/schema.json by composing every kind's schemaFragment.
//
//   node src/deploy/build-schema.mjs            # write src/deploy/schema.json
//   node src/deploy/build-schema.mjs --check    # exit non-zero if file is stale (used in CI)
//
// Uses jiti to load the TS-source schema-builder without a separate build
// step. Keeps schema.json as the single canonical artefact consumers
// reference via `$schema`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, 'schema.json');

const jiti = createJiti(import.meta.url);
const { buildSchema } = await jiti.import('./schema-builder.ts');

const schema = buildSchema();
const next = JSON.stringify(schema, null, 2) + '\n';

const isCheck = process.argv.includes('--check');
if (isCheck) {
  if (!fs.existsSync(target)) {
    console.error(`schema.json missing; run "npm run build:schema" in src/deploy/.`);
    process.exit(1);
  }
  const current = fs.readFileSync(target, 'utf8');
  if (current !== next) {
    console.error(`schema.json is stale; run "npm run build:schema" in src/deploy/.`);
    process.exit(1);
  }
  console.log('schema.json is up to date.');
  process.exit(0);
}

fs.writeFileSync(target, next);
console.log(`Wrote ${path.relative(process.cwd(), target)}.`);
