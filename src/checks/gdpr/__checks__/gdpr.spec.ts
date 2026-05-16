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
//   CHECK_PARAMS      — JSON blob: { complianceMode, trackingDomains,
//                       cookieBlocklist, restrictedRegions,
//                       restrictedChecklyLocations, gtmDomain }
//                       (resolved by gdpr-check/factory.ts from the
//                       preset + overrides at deploy time, so every spec
//                       run is data-driven and the algorithm has no inline
//                       blocklist to drift from config).

import { test } from '@playwright/test';

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
  trackingDomains: string[];
  cookieBlocklist: Record<string, string[]>;
  restrictedRegions: string[];
  restrictedChecklyLocations: string[];
  gtmDomain: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(
      `Required environment variable ${name} is not set. ` +
        `Configure it via the kind's factory (gdpr-check/factory.ts).`,
    );
  }
  return v;
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

// Self-skip when sharing the Playwright config with other kinds' specs.
// In Checkly's cloud each PlaywrightCheck is configured with its own
// CHECK_KIND env var, so only the right spec actually runs.
if (!isOurKind) {
  test.skip(`gdpr spec skipped (CHECK_KIND=${CHECK_KIND || '<unset>'})`, () => {});
}

const CHECK_TARGET_URL = isOurKind ? requireEnv('CHECK_TARGET_URL') : '';
const CHECK_PARAMS = isOurKind ? parseCheckParams() : null;

// ---------- Region detection ----------

async function detectRegion(params: CheckParams): Promise<{
  inRestricted: boolean;
  country: string;
  region?: string;
  source: 'override' | 'checkly-env' | 'ipapi' | 'fallback';
}> {
  // Manual override (handy for local debugging).
  const override = process.env.CHECK_IN_RESTRICTED_REGION;
  if (override !== undefined) {
    const v = override.toLowerCase();
    if (v === 'true' || v === 'false') {
      return { inRestricted: v === 'true', country: 'OVERRIDE', source: 'override' };
    }
  }

  const checklyRegion = process.env.CHECKLY_REGION;
  if (checklyRegion) {
    return {
      inRestricted: params.restrictedChecklyLocations.includes(checklyRegion),
      country: checklyRegion,
      source: 'checkly-env',
    };
  }

  try {
    const res = await fetch('https://ipapi.co/json/', {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`ipapi returned ${res.status}`);
    const data = (await res.json()) as { country_code?: string; region_code?: string };
    const country = (data.country_code ?? '').toUpperCase();
    const region = data.region_code?.toUpperCase();
    const combined = region ? `${country}-${region}` : country;
    const inRestricted = params.restrictedRegions.includes(country) || params.restrictedRegions.includes(combined);
    return { inRestricted, country, region, source: 'ipapi' };
  } catch (err) {
    console.warn(
      'GeoIP lookup failed; defaulting to inRestricted=true. Error:',
      (err as Error).message,
    );
    return { inRestricted: true, country: 'UNKNOWN', source: 'fallback' };
  }
}

// ---------- Cookie / domain matchers ----------

function matchCookie(name: string, blocklist: Record<string, string[]>): string | null {
  for (const [category, patterns] of Object.entries(blocklist)) {
    for (const pattern of patterns) {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        if (name.startsWith(prefix)) return `${category}:${pattern}`;
      } else if (name === pattern) {
        return `${category}:${pattern}`;
      }
    }
  }
  return null;
}

const TWO_LABEL_TLDS = new Set([
  'co.uk', 'co.nz', 'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'com.sg', 'com.hk',
]);
function registrableDomain(host: string): string {
  if (!host) return '';
  const parts = host.toLowerCase().split('.');
  if (parts.length < 2) return host.toLowerCase();
  const last2 = parts.slice(-2).join('.');
  if (parts.length >= 3 && TWO_LABEL_TLDS.has(last2)) {
    return parts.slice(-3).join('.');
  }
  return last2;
}
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

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
        at: performance.now(),
        mode: mode,
        analytics_storage: settings.analytics_storage,
        ad_storage: settings.ad_storage,
      })
    }
  })()
`;

// ---------- The check ----------

test('GDPR - no tracking before consent', async ({ page, context }) => {
  test.setTimeout(60_000);

  if (!isOurKind || !CHECK_PARAMS) {
    // Already skipped above; defensive guard for TS narrowing.
    return;
  }
  const params = CHECK_PARAMS;
  const trackingDomainsSet = new Set(params.trackingDomains);

  const {
    inRestricted: IN_RESTRICTED_REGION,
    country: CURRENT_REGION,
    region: CURRENT_SUBREGION,
    source: REGION_SOURCE,
  } = await detectRegion(params);

  const trackingHits: { url: string; domain: string; resourceType: string }[] = [];
  let gtmHit = false;
  page.on('request', (req) => {
    const url = req.url();
    const domain = registrableDomain(hostnameOf(url));
    if (!domain) return;
    if (domain === params.gtmDomain) {
      gtmHit = true;
      return;
    }
    if (trackingDomainsSet.has(domain)) {
      trackingHits.push({ url, domain, resourceType: req.resourceType() });
    }
  });

  await context.addInitScript({ content: CONSENT_INIT_SCRIPT });

  await page.goto(CHECK_TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 25_000 });

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
  const firstSnap = await context.cookies();
  await page.waitForTimeout(3000);
  const secondSnap = await context.cookies();
  const cookieMap = new Map<string, (typeof firstSnap)[number]>();
  for (const c of [...firstSnap, ...secondSnap]) {
    const key = `${c.name}::${c.domain}::${c.path}`;
    if (!cookieMap.has(key)) cookieMap.set(key, c);
  }
  const cookies = [...cookieMap.values()];

  const pageReg = registrableDomain(hostnameOf(CHECK_TARGET_URL));
  const offendingCookies = cookies
    .map((c) => {
      const rule = matchCookie(c.name, params.cookieBlocklist);
      if (!rule) return null;
      const cookieReg = registrableDomain(c.domain.replace(/^\./, ''));
      const party = cookieReg === pageReg ? 'first' : 'third';
      return { name: c.name, domain: c.domain, party, rule };
    })
    .filter((x): x is { name: string; domain: string; party: string; rule: string } => x !== null);

  const consentLog = (await page
    .evaluate(() => (window as unknown as { __gdprConsentLog?: unknown[] }).__gdprConsentLog ?? [])
    .catch(() => [])) as Array<{ mode?: string; analytics_storage?: string; ad_storage?: string }>;
  const consentDefault = consentLog.find(
    (e) => e?.mode === 'default' && e?.analytics_storage === 'denied' && e?.ad_storage === 'denied',
  );

  const enforce =
    params.complianceMode === 'global' ||
    (params.complianceMode === 'targeted' && IN_RESTRICTED_REGION);

  const regionLabel = CURRENT_SUBREGION ? `${CURRENT_REGION}-${CURRENT_SUBREGION}` : CURRENT_REGION;
  console.log('GDPR check:', CHECK_TARGET_URL);
  console.log('  compliance mode:         ', params.complianceMode);
  console.log('  detected region:         ', `${regionLabel} (via ${REGION_SOURCE})`);
  console.log('  region is restricted:    ', IN_RESTRICTED_REGION);
  console.log('  enforcing assertions:    ', enforce);
  console.log('  cookies observed:        ', cookies.length);
  console.log('  offending cookies:       ', offendingCookies.length);
  console.log('  tracking requests:       ', trackingHits.length);
  console.log('  GTM observed:            ', gtmHit);
  console.log('  consent-mode denied dflt:', !!consentDefault);
  for (const o of offendingCookies) {
    console.log(`    - cookie ${o.name} (${o.party}-party @ ${o.domain}) matched ${o.rule}`);
  }
  const trackingDomainsHit = [...new Set(trackingHits.map((r) => r.domain))];
  if (trackingDomainsHit.length) {
    console.log(`    - tracking domains hit: ${trackingDomainsHit.join(', ')}`);
  }
  if (gtmHit && !consentDefault) {
    console.log('    - GTM loaded WITHOUT a consent-mode denied default first (probable violation)');
  } else if (gtmHit && consentDefault) {
    console.log('    - GTM loaded but consent-mode default=denied recorded first (acceptable)');
  }

  if (!enforce) {
    console.log('  -> enforcement skipped (targeted mode, unrestricted region)');
    return;
  }

  const failures: string[] = [];

  if (offendingCookies.length > 0) {
    failures.push(
      `Non-essential cookies set before consent (${offendingCookies.length}):` +
        offendingCookies.map((c) => `\n  - ${c.name} (${c.party}-party @ ${c.domain}) [${c.rule}]`).join(''),
    );
  }

  if (trackingHits.length > 0) {
    failures.push(
      `Tracking requests fired before consent (${trackingHits.length}) to:` +
        trackingDomainsHit.map((d) => `\n  - ${d}`).join(''),
    );
  }

  if (gtmHit && !consentDefault) {
    failures.push(
      "GTM loaded but no Consent Mode default=denied was set first. " +
        "Configure gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' }) " +
        'before the GTM container script.',
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `GDPR compliance failed for ${CHECK_TARGET_URL} (region ${regionLabel}):\n\n` + failures.join('\n\n'),
    );
  }
});
