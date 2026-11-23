// Playwright helpers shared by the gdpr and ccpa specs.

import type { BrowserContext, Page } from '@playwright/test';

/** Load, scroll for lazy tags, then wait for the network to settle. */
export async function loadAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });

  await page
    .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    .catch(() => {
      /* ignore */
    });

  try {
    await page.waitForLoadState('networkidle', { timeout: 8_000 });
  } catch {
    /* ignore */
  }
}

type Cookie = Awaited<ReturnType<BrowserContext['cookies']>>[number];

/** Union of two snapshots 3s apart: Pixel cookies land synchronously, GA's later. */
export async function snapshotCookies(page: Page, context: BrowserContext): Promise<Cookie[]> {
  const first = await context.cookies();
  await page.waitForTimeout(3000);
  const second = await context.cookies();

  const byKey = new Map<string, Cookie>();
  for (const c of [...first, ...second]) {
    const key = `${c.name}::${c.domain}::${c.path}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  return [...byKey.values()];
}

export function requireEnv(env: Record<string, string | undefined>, name: string, kind: string): string {
  const v = env[name];
  if (v === undefined || v === '') {
    throw new Error(
      `Required environment variable ${name} is not set. Configure it via the kind's factory (${kind}/factory.ts).`,
    );
  }
  return v;
}
