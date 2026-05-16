import { defineConfig } from 'checkly';
import { loadConsumerConfig } from './load-config.ts';

// IMPORTANT: do NOT create Checkly constructs (new ApiCheck, new
// PlaywrightCheck, ...) here. Checkly v7 rejects that with:
//   "Creating a ApiCheck construct in the Checkly config file isn't supported."
// The actual construct creation happens in ./all.check.ts, which the
// CLI auto-discovers via the default *.check.ts glob.

const config = loadConsumerConfig();

export default defineConfig({
  projectName: config.project.name,
  logicalId: config.project.logicalId,
  checks: {
    checkMatch: '*.check.ts',
  },
});
