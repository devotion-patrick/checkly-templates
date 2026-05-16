import { defineConfig } from 'checkly';
import { loadConsumerConfig } from './load-config.ts';

// IMPORTANT: do NOT create Checkly constructs (new ApiCheck, new
// PlaywrightCheck, ...) here. Checkly v7 rejects that with:
//   "Creating a ApiCheck construct in the Checkly config file isn't supported."
// The actual construct creation happens in ./all.check.ts, which the
// CLI auto-discovers via the default *.check.ts glob.

const config = loadConsumerConfig();

// `checkly test` (smoke pass) picks ONE region for the whole test
// session — separate from per-check `locations` which only applies to
// deployed monitors. Default Checkly behaviour falls back to
// eu-central-1, which surprised consumers who'd set their project
// default to ap-southeast-2 expecting smoke to follow. We default
// cli.runLocation to the first project-default location so smoke and
// monitor agree on geography out of the box.
//
// Pipeline can override per-run by passing `--location <region>` to
// `checkly test` (the ADO template exposes this via `smokeLocation`).
const defaultLocation = config.project.defaults?.locations?.[0];

export default defineConfig({
  projectName: config.project.name,
  logicalId: config.project.logicalId,
  checks: {
    checkMatch: '*.check.ts',
  },
  ...(defaultLocation
    ? { cli: { runLocation: defaultLocation as never } }
    : {}),
});
