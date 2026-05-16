import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Shared Playwright config for every Playwright kind in this repo. Each
// kind keeps its spec at src/checks/<kind>/__checks__/<kind>.spec.ts and
// the testDir + testMatch below picks them all up. Per-check filtering
// happens inside the spec itself: every spec reads CHECK_KIND and skips
// if it isn't its own kind. This is simpler than threading per-check
// testMatch through the PlaywrightCheck construct and works identically
// locally and in Checkly's cloud.
const here = path.dirname(fileURLToPath(import.meta.url));
const checksDir = path.resolve(here, '..', 'checks');

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
