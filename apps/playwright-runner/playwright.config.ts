import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Points at the repo's shared specs under src/checks/<kind>/__checks__.
// Every spec self-skips unless CHECK_KIND matches the env var run.mjs set
// for this invocation, so one config hosts all three Playwright kinds.
// Mirror of apps/checkly-runner/playwright.config.ts and
// src/deploy/playwright.config.ts.
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
