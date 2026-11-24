// Checkly Playwright check — GDPR consent leak.
//
// Runs both locally (`npx playwright test` from this kind's folder) and
// in Checkly's cloud. Behaviour is fully driven by the env-var contract
// shared by every Playwright kind in this repo:
//
//   CHECK_KIND        — must equal "gdpr" for this spec to enforce anything.
//                       Other kinds' specs read this and skip mismatches,
//                       so the same shared Playwright config can host all
//                       Playwright kinds.
//   CHECK_TARGET_URL  — absolute URL to load.
//   CHECK_PARAMS      — JSON blob: { complianceMode, checkLevel?,
//                       trackingDomains, cookieBlocklist, restrictedRegions,
//                       restrictedChecklyLocations, gtmDomain }
//                       (resolved by gdpr-check/factory.ts from the
//                       preset + overrides at deploy time, so every spec
//                       run is data-driven and the algorithm has no inline
//                       blocklist to drift from config).
//
// Runtime env, set per environment rather than per check:
//
//   GDPR_CHECK_LEVEL           — report | standard | strict. Default standard.
//                                A site's own checkLevel wins.
//   CHECK_LOCATION             — Checkly location, set per check by the factory.
//   GDPR_REGION                — ISO code (e.g. DE, GB). Skips the GeoIP lookup.
//   GDPR_GEOIP_API_KEY         — ipapi.co key, avoids the shared-IP 429.
//   CHECK_IN_RESTRICTED_REGION — true | false, local debugging.
//
// Grading lives in ./grading.ts; levels are explained in the kind's README.

import fs from 'node:fs';
import { expect, test as base } from '@playwright/test';
import { hostnameOf, matchCookie, matchDomain, registrableDomain } from '../../_privacy/common.ts';
import { loadAndSettle, requireEnv as requireEnvFrom, snapshotCookies } from '../../_privacy/browser.ts';
import {
  type ConsentDefault,
  type Finding,
  type OffendingCookie,
  type RegionInfo,
  type TrackingRequest,
  describeRegion,
  detectRegion,
  gradeFindings,
  resolveCheckLevel,
  verdictOf,
} from './grading.ts';

declare const process: { env: Record<string, string | undefined> };
declare const fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const KIND = 'gdpr';

type ComplianceMode = 'global' | 'targeted';

interface CheckParams {
  complianceMode: ComplianceMode;
  checkLevel?: string;
  trackingDomains: string[];
  cookieBlocklist: Record<string, string[]>;
  restrictedRegions: string[];
  restrictedChecklyLocations: string[];
  gtmDomain: string;
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
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`CHECK_PARAMS must be a JSON object.`);
  }
  const p = parsed as Partial<CheckParams>;
  for (const key of ['complianceMode', 'trackingDomains', 'cookieBlocklist', 'restrictedRegions', 'restrictedChecklyLocations', 'gtmDomain'] as const) {
    if (p[key] === undefined) throw new Error(`CHECK_PARAMS missing "${key}"`);
  }
  return p as CheckParams;
}

const CHECK_KIND = process.env.CHECK_KIND ?? '';
const isOurKind = CHECK_KIND === KIND;

// GeoIP once per worker, not per test.
const test = base.extend<object, { region: RegionInfo }>({
  region: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      // No lookup when another kind's check is running this file.
      if (!CHECK_PARAMS) {
        await use({ inRestricted: true, region: 'UNKNOWN', source: 'fallback', reason: 'not a gdpr run' });
        return;
      }
      await use(await detectRegion(CHECK_PARAMS, process.env, fetch));
    },
    { scope: 'worker' },
  ],
});

// Self-skip when sharing the Playwright config with other kinds' specs.
// In Checkly's cloud each PlaywrightCheck is configured with its own
// CHECK_KIND env var, so only the right spec actually runs.
if (!isOurKind) {
  test.skip(`gdpr spec skipped (CHECK_KIND=${CHECK_KIND || '<unset>'})`, () => {});
}

const CHECK_TARGET_URL = isOurKind ? requireEnv('CHECK_TARGET_URL') : '';
const CHECK_PARAMS = isOurKind ? parseCheckParams() : null;

// Patched before any page script runs so we observe gtag('consent', ...)
// calls in execution order. Reading page source for these is unreliable
// because GTM and inlined snippets can both fire them.
const CONSENT_INIT_SCRIPT = `
  (function () {
    window.__gdprConsentLog = []
    Object.defineProperty(window, 'dataLayer', {
      configurable: true,
      get() { return this._dl || (this._dl = makeDl()) },
      set(v) { this._dl = makeDl(v) },
    })
    function makeDl(seed) {
      var arr = Array.isArray(seed) ? seed.slice() : []
      var nativePush = Array.prototype.push
      arr.push = function () {
        for (var i = 0; i < arguments.length; i++) recordIfConsent(arguments[i])
        return nativePush.apply(this, arguments)
      }
      return arr
    }
    function recordIfConsent(args) {
      if (!args || typeof args !== 'object') return
      var verb = args[0] || args['0']
      if (verb !== 'consent') return
      var mode = args[1] || args['1']
      var settings = args[2] || args['2']
      if (!mode || !settings) return
      window.__gdprConsentLog.push({
        at: Date.now(),
        mode: mode,
        analytics_storage: settings.analytics_storage,
        ad_storage: settings.ad_storage,
      })
    }
  })()
`;

// ---------- The check ----------

test('GDPR - no tracking before consent', async ({ page, context, region }) => {
  test.setTimeout(60_000);

  if (!isOurKind || !CHECK_PARAMS) {
    // Already skipped above; defensive guard for TS narrowing.
    return;
  }
  const params = CHECK_PARAMS;

  const { level, source: levelSource } = resolveCheckLevel(params.checkLevel, process.env.GDPR_CHECK_LEVEL);

  const trackingRequests: TrackingRequest[] = [];
  let gtmHit = false;
  page.on('request', (req) => {
    const url = req.url();
    const host = hostnameOf(url);
    if (!host) return;
    if (matchDomain(host, [params.gtmDomain])) {
      gtmHit = true;
      return;
    }
    // Entry or a subdomain of it, so `bat.bing.com` matches; registrable domain kept for grading.
    if (matchDomain(host, params.trackingDomains)) {
      trackingRequests.push({ url, domain: registrableDomain(host), at: Date.now() });
    }
  });

  await context.addInitScript({ content: CONSENT_INIT_SCRIPT });

  await loadAndSettle(page, CHECK_TARGET_URL);
  const cookies = await snapshotCookies(page, context);

  const pageReg = registrableDomain(hostnameOf(CHECK_TARGET_URL));
  const offendingCookies: OffendingCookie[] = cookies.flatMap((c) => {
    const rule = matchCookie(c.name, params.cookieBlocklist);
    if (!rule) return [];
    const cookieReg = registrableDomain(c.domain.replace(/^\./, ''));
    const party = cookieReg === pageReg ? 'first' : 'third';
    return [{ name: c.name, domain: c.domain, party, rule }];
  });

  const consentLog = (await page
    .evaluate(() => (window as unknown as { __gdprConsentLog?: unknown[] }).__gdprConsentLog ?? [])
    .catch(() => [])) as Array<{ at?: number; mode?: string; analytics_storage?: string; ad_storage?: string }>;
  const deniedDefault = consentLog.find(
    (e) => e?.mode === 'default' && e?.analytics_storage === 'denied' && e?.ad_storage === 'denied',
  );
  const consentDefault: ConsentDefault | null = deniedDefault ? { at: deniedDefault.at ?? 0 } : null;

  // Report never enforces; targeted mode enforces only from a restricted region.
  const regionEnforces = params.complianceMode === 'global' || region.inRestricted;
  const enforce = level !== 'report' && regionEnforces;

  const findings: Finding[] = gradeFindings(
    {
      pageUrl: CHECK_TARGET_URL,
      cookies: offendingCookies,
      trackingRequests,
      gtmLoaded: gtmHit,
      consentDefault,
    },
    level === 'report' ? 'standard' : level,
  );
  const failures = findings.filter((f) => f.severity === 'FAIL');
  const warnings = findings.filter((f) => f.severity === 'WARN');
  const verdict = verdictOf(findings);

  console.log('GDPR check:', CHECK_TARGET_URL);
  console.log('  check level:          ', `${level} (${levelSource})`);
  console.log('  compliance mode:      ', params.complianceMode);
  console.log('  region:               ', describeRegion(region));
  console.log('  enforcing:            ', enforce ? 'yes' : `no (${notEnforcingReason(level)})`);
  console.log('  cookies observed:     ', cookies.length);
  console.log('  tracking requests:    ', trackingRequests.length);
  console.log('  GTM observed:         ', gtmHit);
  console.log('  consent default denied:', !!consentDefault);
  console.log(`  findings (${findings.length}):`);
  for (const f of findings) {
    console.log(`    [${f.severity}] ${f.rule}: ${f.detail}`);
    if (f.url !== CHECK_TARGET_URL) console.log(`           ${f.url}`);
  }
  if (findings.length === 0) console.log('    none');

  const counts = `${failures.length} FAIL, ${warnings.length} WARN`;
  if (!enforce) {
    console.log(`  result: not enforced, would have ${verdict} (${counts})`);
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

  expect(failures, `GDPR ${level}: findings graded FAIL for ${CHECK_TARGET_URL}`).toEqual([]);
});

function notEnforcingReason(level: string): string {
  return level === 'report' ? 'report level' : 'targeted mode, unrestricted region';
}
