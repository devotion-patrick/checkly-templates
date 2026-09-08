// Pure CHECK_* env-var builder — deliberately checkly-free (no import from
// `checkly/constructs`) so it can be shared between the Checkly-backed
// factory.ts (wraps this in a PlaywrightCheck construct) and
// apps/playwright-runner (sets these directly as process env vars and
// invokes `playwright test` locally, with no Checkly dependency at all).
// Keeping this the single source of truth for CHECK_PARAMS' shape means
// the two runners can't drift out of sync with each other.

import { KIND, type LaunchReadinessEntry } from './schema.ts';

export interface CheckEnv {
  CHECK_TARGET_URL: string;
  CHECK_KIND: string;
  CHECK_PARAMS: string;
}

export function buildCheckEnv(entry: LaunchReadinessEntry): CheckEnv {
  return {
    CHECK_TARGET_URL: entry.url,
    CHECK_KIND: KIND,
    CHECK_PARAMS: JSON.stringify({
      waitUntil: entry.waitUntil ?? 'domcontentloaded',
      followJsRedirect: entry.followJsRedirect ?? false,
      expectPubliclyAccessible: entry.expectPubliclyAccessible ?? true,
      checks: entry.checks,
    }),
  };
}
