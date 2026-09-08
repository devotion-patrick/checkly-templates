import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'checkly';
import { loadConsumerConfig } from '../../src/deploy/load-config.ts';

// IMPORTANT: do NOT create Checkly constructs (new ApiCheck, ...) here.
// Checkly v7 rejects that from inside the config file. Construct creation
// happens in ./checks.check.ts, which the CLI auto-discovers via the
// `*.check.ts` glob below.

// `checkly test` needs CHECKLY_API_KEY + CHECKLY_ACCOUNT_ID. Reuse the
// repo's existing local-testing/.env (gitignored) so creds set up once for
// `npm run try:*` also work here, without re-exporting them in the shell.
// Any var already in the environment wins (loadEnvFile doesn't overwrite).
const envFile = fileURLToPath(new URL('../../local-testing/.env', import.meta.url));
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// Default the env var the shared loader reads to the example config under
// ./configs (absolute, so it resolves no matter the cwd). To run a
// different config, export CHECKLY_TEMPLATES_CONFIG pointing at any file in
// ./configs before invoking the CLI. Assigned before loadConsumerConfig()
// is called, which is all that matters — the import above has no
// config-reading side effect.
process.env.CHECKLY_TEMPLATES_CONFIG ??= fileURLToPath(
  new URL('./configs/_examples.json', import.meta.url),
);

const config = loadConsumerConfig();

// Keep `checkly test` (smoke) geography in step with the project's first
// default location, instead of Checkly's eu-central-1 fallback. Mirrors
// the deploy project's config; override per-run with `--location <region>`.
const defaultLocation = config.project.defaults?.locations?.[0];

export default defineConfig({
  projectName: config.project.name,
  logicalId: config.project.logicalId,
  checks: {
    checkMatch: '*.check.ts',
  },
  ...(defaultLocation ? { cli: { runLocation: defaultLocation as never } } : {}),
});
