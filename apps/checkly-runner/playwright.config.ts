import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Needed only for Playwright-based kinds (gdpr, xpath-spa, launch-readiness).
// Each kind's factory sets `playwrightConfigPath: './playwright.config.ts'`,
// resolved against THIS project — so the runner needs its own copy. It
// points back at the repo's shared specs under src/checks/<kind>/__checks__.
// Every spec self-skips unless CHECK_KIND matches, so one config hosts all
// Playwright kinds. Mirror of src/deploy/playwright.config.ts.
const here = path.dirname(fileURLToPath(import.meta.url));
const checksDir = path.resolve(here, '..', '..', 'src', 'checks');

export default defineConfig({
  testDir: checksDir,
  testMatch: '**/__checks__/**/*.spec.ts',
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    storageState: undefined,
  },
});
