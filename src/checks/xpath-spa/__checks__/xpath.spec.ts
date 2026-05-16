// Checkly PlaywrightCheck — DOM selector assertions on a JS-rendered page.
//
// Env contract (set by xpath-check-spa/factory.ts):
//   CHECK_KIND        — must equal "xpath-spa" for this spec to enforce.
//   CHECK_TARGET_URL  — absolute URL to load.
//   CHECK_PARAMS      — JSON: { waitUntil, selectors: XpathSpaSelector[] }

import { expect, test } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> };

const KIND = 'xpath-spa';

interface Selector {
  selector: string;
  equals?: string;
  contains?: string;
  notContains?: string;
  attribute?: string;
  count?: number;
}

interface CheckParams {
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle';
  selectors: Selector[];
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Required environment variable ${name} is not set.`);
  }
  return v;
}

const CHECK_KIND = process.env.CHECK_KIND ?? '';
const isOurKind = CHECK_KIND === KIND;

if (!isOurKind) {
  test.skip(`xpath-spa spec skipped (CHECK_KIND=${CHECK_KIND || '<unset>'})`, () => {});
}

const CHECK_TARGET_URL = isOurKind ? requireEnv('CHECK_TARGET_URL') : '';
const CHECK_PARAMS = isOurKind ? (JSON.parse(requireEnv('CHECK_PARAMS')) as CheckParams) : null;

test('xpath-spa - DOM selector assertions', async ({ page }) => {
  test.setTimeout(60_000);
  if (!isOurKind || !CHECK_PARAMS) return;

  await page.goto(CHECK_TARGET_URL, { waitUntil: CHECK_PARAMS.waitUntil, timeout: 25_000 });

  for (const s of CHECK_PARAMS.selectors) {
    const locator = page.locator(s.selector).first();
    const label = `selector "${s.selector}"`;

    if (s.count !== undefined) {
      await expect(page.locator(s.selector), `${label} count`).toHaveCount(s.count);
    }

    if (s.equals === undefined && s.contains === undefined && s.notContains === undefined) {
      // `count`-only assertion; nothing further to inspect.
      continue;
    }

    const observed: string = s.attribute
      ? ((await locator.getAttribute(s.attribute)) ?? '')
      : ((await locator.textContent()) ?? '').trim();

    if (s.equals !== undefined) {
      expect(observed, `${label} ${s.attribute ? `attr[${s.attribute}]` : 'text'}`).toBe(s.equals);
    }
    if (s.contains !== undefined) {
      expect(observed, `${label} ${s.attribute ? `attr[${s.attribute}]` : 'text'}`).toContain(s.contains);
    }
    if (s.notContains !== undefined) {
      expect(observed, `${label} ${s.attribute ? `attr[${s.attribute}]` : 'text'}`).not.toContain(s.notContains);
    }
  }
});
