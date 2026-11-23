// Checkly Playwright check — CCPA opt-out (California).
//
// Env contract, as every Playwright kind:
//   CHECK_KIND        — must equal "ccpa"; other values self-skip.
//   CHECK_TARGET_URL  — absolute URL to load.
//   CHECK_PARAMS      — JSON: { checkLevel?, adTechDomains, analyticsDomains,
//                       adCookieBlocklist, optOutLinkPatterns, optOutSelectors }
//                       resolved by ccpa/env.ts from the preset + overrides.
//   CHECK_LOCATION    — Checkly location, set per check by the factory.
//
// Runtime env:
//   CCPA_CHECK_LEVEL  — report | standard | strict. Default standard. A site's checkLevel wins.
//
// Two passes in fresh contexts: baseline, then Global Privacy Control on.
// Grading lives in ./grading.ts; rationale in the kind's README.

import fs from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
// Relative, not the workspace package: Checkly's bundler would try to npm-install that.
import { californiaChecklyLocations } from '../../../shared/presets/ccpa-ca.ts';
import { hostnameOf, matchCookie, matchDomain } from '../../_privacy/common.ts';
import { loadAndSettle, requireEnv as requireEnvFrom, snapshotCookies } from '../../_privacy/browser.ts';
import {
  type Finding,
  type ObservedRequest,
  type OptOutLink,
  type PassObservations,
  type PrivacyStrings,
  gradeFindings,
  privacyOptOut,
  resolveCheckLevel,
  verdictOf,
} from './grading.ts';

declare const process: { env: Record<string, string | undefined> };

const KIND = 'ccpa';

interface CheckParams {
  checkLevel?: string;
  adTechDomains: string[];
  analyticsDomains: string[];
  adCookieBlocklist: Record<string, string[]>;
  optOutLinkPatterns: string[];
  optOutSelectors: string[];
}

function requireEnv(name: string): string {
  return requireEnvFrom(process.env, name, KIND);
}

function parseCheckParams(): CheckParams {
  const raw = requireEnv('CHECK_PARAMS');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`CHECK_PARAMS is not valid JSON: ${(err as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('CHECK_PARAMS must be a JSON object.');
  const p = parsed as Partial<CheckParams>;
  for (const key of ['adTechDomains', 'analyticsDomains', 'adCookieBlocklist', 'optOutLinkPatterns', 'optOutSelectors'] as const) {
    if (p[key] === undefined) throw new Error(`CHECK_PARAMS missing "${key}"`);
  }
  return p as CheckParams;
}

const CHECK_KIND = process.env.CHECK_KIND ?? '';
const isOurKind = CHECK_KIND === KIND;

if (!isOurKind) {
  test.skip(`ccpa spec skipped (CHECK_KIND=${CHECK_KIND || '<unset>'})`, () => {});
}

const CHECK_TARGET_URL = isOurKind ? requireEnv('CHECK_TARGET_URL') : '';
const CHECK_PARAMS = isOurKind ? parseCheckParams() : null;

// Real browsers expose GPC on navigator as well as the Sec-GPC header.
const GPC_INIT_SCRIPT = `
  Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true });
`;

// ---------- Browser helpers ----------

function recordRequests(page: Page, domains: string[]): ObservedRequest[] {
  const requests: ObservedRequest[] = [];
  page.on('request', (req) => {
    if (matchDomain(hostnameOf(req.url()), domains)) {
      requests.push({ url: req.url(), resourceType: req.resourceType() });
    }
  });
  return requests;
}

/** GPP and US Privacy strings from the CMP's APIs; empty when the page has neither. */
async function readPrivacyStrings(page: Page): Promise<PrivacyStrings> {
  return page
    .evaluate(
      () =>
        new Promise<PrivacyStrings>((resolve) => {
          const w = window as any;
          const out: PrivacyStrings = {};
          let pending = 0;
          const done = () => {
            pending -= 1;
            if (pending <= 0) resolve(out);
          };

          if (typeof w.__uspapi === 'function') {
            pending += 1;
            try {
              w.__uspapi('getUSPData', 1, (d: any, ok: boolean) => {
                if (ok && d?.uspString) out.usp = d.uspString;
                done();
              });
            } catch {
              done();
            }
          }

          if (typeof w.__gpp === 'function') {
            pending += 1;
            try {
              w.__gpp('ping', (d: any) => {
                if (d?.gppString) out.gppString = d.gppString;
                if (d?.parsedSections) out.gppParsed = d.parsedSections;
                done();
              });
            } catch {
              done();
            }
          }

          if (pending === 0) resolve(out);
          setTimeout(() => resolve(out), 2_000);
        }),
    )
    .catch(() => ({}));
}

async function findOptOutLink(page: Page, patterns: string[], selectors: string[]): Promise<OptOutLink> {
  return page
    .evaluate(
      ({ patterns, selectors }) => {
        const els = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]'));
        for (const el of els) {
          const text = [el.textContent, el.getAttribute('aria-label'), el.getAttribute('title')]
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .toLowerCase();
          const hit = patterns.find((p) => text.includes(p.toLowerCase()));
          if (hit) return { found: true, via: `text "${hit}"` };
        }
        for (const sel of selectors) {
          try {
            if (document.querySelector(sel)) return { found: true, via: `selector ${sel}` };
          } catch {
            /* invalid selector */
          }
        }
        return { found: false };
      },
      { patterns, selectors },
    )
    .catch(() => ({ found: false }));
}

async function runPass(
  page: Page,
  context: BrowserContext,
  params: CheckParams,
): Promise<PassObservations> {
  const requests = recordRequests(page, [...params.adTechDomains, ...params.analyticsDomains]);
  await loadAndSettle(page, CHECK_TARGET_URL);
  const cookies = await snapshotCookies(page, context);

  return {
    requests,
    adCookies: cookies.flatMap((c) => {
      const rule = matchCookie(c.name, params.adCookieBlocklist);
      return rule ? [{ name: c.name, domain: c.domain, rule }] : [];
    }),
    privacy: await readPrivacyStrings(page),
  };
}

// ---------- The check ----------

test('CCPA - opt-out honoured', async ({ page, context, browser }) => {
  test.setTimeout(90_000);

  if (!isOurKind || !CHECK_PARAMS) return;
  const params = CHECK_PARAMS;

  const { level, source: levelSource } = resolveCheckLevel(params.checkLevel, process.env.CCPA_CHECK_LEVEL);
  const location = process.env.CHECK_LOCATION;
  const inCalifornia = !!location && californiaChecklyLocations.has(location);

  // Pass 1: baseline.
  const baseline = await runPass(page, context, params);
  const optOutLink = await findOptOutLink(page, params.optOutLinkPatterns, params.optOutSelectors);

  // Pass 2: GPC on, fresh context with the same browser profile.
  const gpcContext = await browser.newContext({
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: page.viewportSize() ?? undefined,
    extraHTTPHeaders: { 'Sec-GPC': '1' },
  });
  await gpcContext.addInitScript({ content: GPC_INIT_SCRIPT });
  const gpcPage = await gpcContext.newPage();
  const gpc = await runPass(gpcPage, gpcContext, params);
  await gpcContext.close();

  const findings: Finding[] = gradeFindings(
    {
      pageUrl: CHECK_TARGET_URL,
      adTechDomains: params.adTechDomains,
      analyticsDomains: params.analyticsDomains,
      baseline,
      gpc,
      optOutLink,
    },
    level === 'report' ? 'standard' : level,
  );
  const failures = findings.filter((f) => f.severity === 'FAIL');
  const warnings = findings.filter((f) => f.severity === 'WARN');
  const verdict = verdictOf(findings);
  const enforce = level !== 'report';

  console.log('CCPA check:', CHECK_TARGET_URL);
  console.log('  check level:           ', `${level} (${levelSource})`);
  console.log('  location:              ', location ?? 'local run (no CHECK_LOCATION)');
  if (!inCalifornia) {
    console.log('                          not a California location; the site may not show its CCPA behaviour');
  }
  console.log('  opt-out link:          ', optOutLink.found ? `found via ${optOutLink.via}` : 'not found');
  console.log('  baseline requests:     ', baseline.requests.length, `(ad cookies: ${baseline.adCookies.length})`);
  console.log('  GPC requests:          ', gpc.requests.length, `(ad cookies: ${gpc.adCookies.length})`);
  console.log('  CMP opt-out after GPC: ', privacyOptOut(gpc.privacy));
  console.log(`  findings (${findings.length}):`);
  for (const f of findings) {
    console.log(`    [${f.severity}] ${f.rule}: ${f.detail}`);
    if (f.url !== CHECK_TARGET_URL) console.log(`           ${f.url}`);
  }
  if (findings.length === 0) console.log('    none');

  const counts = `${failures.length} FAIL, ${warnings.length} WARN`;
  if (!enforce) {
    console.log(`  result: not enforced (report level), would have ${verdict} (${counts})`);
    return;
  }
  console.log(`  result: ${verdict} (${counts})`);

  for (const w of warnings) {
    test.info().annotations.push({ type: 'warning', description: `${w.rule}: ${w.detail}` });
  }

  // WARN-only runs show as Degraded in Checkly rather than a clean pass.
  if (failures.length === 0 && warnings.length > 0) {
    fs.writeFileSync(
      'degraded.json',
      JSON.stringify({ messages: warnings.map((w) => `[WARN] ${w.rule}: ${w.detail}`) }),
    );
  }

  expect(failures, `CCPA ${level}: findings graded FAIL for ${CHECK_TARGET_URL}`).toEqual([]);
});
