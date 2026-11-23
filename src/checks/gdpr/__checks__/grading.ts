// Pure grading for the GDPR spec. No Playwright import, so node:test can load it.
// Grading table and rationale: src/checks/gdpr/README.md#check-levels.

export type CheckLevel = 'report' | 'standard' | 'strict';
export type GradingLevel = Exclude<CheckLevel, 'report'>;
export type Grade = 'INFO' | 'WARN' | 'FAIL';

export const CHECK_LEVELS: readonly CheckLevel[] = ['report', 'standard', 'strict'];
export const DEFAULT_CHECK_LEVEL: CheckLevel = 'standard';

export interface Finding {
  severity: Grade;
  rule: string;
  detail: string;
  url: string;
}

export type Rank = 'critical' | 'serious' | 'moderate' | 'advisory';

export interface OffendingCookie {
  name: string;
  domain: string;
  party: 'first' | 'third';
  /** `category:pattern`, as the blocklist is keyed. */
  rule: string;
}

export interface TrackingRequest {
  url: string;
  domain: string;
  /** Wall-clock ms, comparable with `ConsentDefault.at`. */
  at: number;
}

export interface ConsentDefault {
  /** Wall-clock ms the denied default was pushed to dataLayer. */
  at: number;
}

export interface Observations {
  pageUrl: string;
  cookies: OffendingCookie[];
  trackingRequests: TrackingRequest[];
  gtmLoaded: boolean;
  consentDefault: ConsentDefault | null;
}

// ---------- Cookie rank (1.3.0 ordering, kept for the detail text) ----------

const RANK_ORDER: Rank[] = ['critical', 'serious', 'moderate', 'advisory'];

const RANK_REASON: Record<Rank, string> = {
  critical: 'cross-site advertising identifier',
  serious: 'first-party analytics or profiling identifier',
  moderate: 'third-party embed or consent-mode weakness',
  advisory: 'no identifier stored',
};

// Categories added through overrides fall through to serious.
const CATEGORY_RANK: Record<string, Rank> = {
  google_ads: 'critical',
  meta: 'critical',
  google_doubleclick: 'critical',
  bing: 'critical',
  linkedin: 'critical',
  tiktok: 'critical',
  pinterest: 'critical',

  google_analytics: 'serious',
  hotjar: 'serious',
  hubspot: 'serious',

  youtube: 'moderate',
  google_shared: 'moderate',
};

// DoubleClick's cookie-support probe. Holds no identifier; the doubleclick.net
// request that sets it is graded on its own.
const ADVISORY_COOKIES = new Set(['test_cookie']);

export function rankOfCookie(cookie: OffendingCookie): Rank {
  if (ADVISORY_COOKIES.has(cookie.name)) return 'advisory';
  return CATEGORY_RANK[categoryOf(cookie)] ?? 'serious';
}

function categoryOf(cookie: OffendingCookie): string {
  return cookie.rule.split(':')[0] ?? '';
}

// ---------- Google Consent Mode signal ----------

/** Registrable domains whose hits carry Consent Mode state (gcs / gcd). */
export const GOOGLE_TRACKING_DOMAINS: ReadonlySet<string> = new Set([
  'google-analytics.com',
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google.com',
]);

// Cookies that would make a denied-state Google hit not cookieless.
const GOOGLE_COOKIE_CATEGORIES = new Set(['google_analytics', 'google_ads', 'google_doubleclick']);

export type ConsentState = 'denied' | 'granted' | 'none';

export interface GoogleConsent {
  state: ConsentState;
  /** e.g. `gcs=G100`, or `no gcs/gcd` */
  signal: string;
  adStorage: StorageState;
  analyticsStorage: StorageState;
}

type StorageState = 'denied' | 'granted' | 'unset';

// gcd letters per storage type. https://developers.google.com/tag-platform/security/guides/consent-debugging
const GCD_LETTER: Record<string, StorageState> = {
  l: 'unset',
  p: 'denied', // denied by default
  q: 'denied', // denied by default and update
  m: 'denied', // denied by update
  u: 'denied', // granted by default, denied by update
  t: 'granted', // granted by default
  r: 'granted', // denied by default, granted by update
  n: 'granted', // granted by update
  v: 'granted', // granted by default and update
};

/**
 * Consent Mode state from a Google hit. gcs wins over gcd: gcs is the
 * effective state, gcd the history behind it.
 */
export function parseGoogleConsent(url: string): GoogleConsent {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return noSignal();
  }

  const gcs = params.get('gcs');
  const gcsMatch = gcs ? /^G1([01])([01])$/.exec(gcs) : null;
  if (gcsMatch) {
    const ad: StorageState = gcsMatch[1] === '1' ? 'granted' : 'denied';
    const analytics: StorageState = gcsMatch[2] === '1' ? 'granted' : 'denied';
    return { state: combine(ad, analytics), signal: `gcs=${gcs}`, adStorage: ad, analyticsStorage: analytics };
  }

  const gcd = params.get('gcd');
  if (gcd && gcd.length > 2) {
    // Two-char prefix, then one letter per storage type: ad_storage, analytics_storage, ...
    const letters = gcd.slice(2).match(/[a-z]/gi) ?? [];
    const ad = GCD_LETTER[(letters[0] ?? '').toLowerCase()] ?? 'unset';
    const analytics = GCD_LETTER[(letters[1] ?? '').toLowerCase()] ?? 'unset';
    return { state: combine(ad, analytics), signal: `gcd=${gcd}`, adStorage: ad, analyticsStorage: analytics };
  }

  return noSignal();
}

function noSignal(): GoogleConsent {
  return { state: 'none', signal: 'no gcs/gcd', adStorage: 'unset', analyticsStorage: 'unset' };
}

// Any storage granted before consent is granted. Denied needs analytics_storage explicitly denied.
function combine(ad: StorageState, analytics: StorageState): ConsentState {
  if (ad === 'granted' || analytics === 'granted') return 'granted';
  if (analytics === 'denied') return 'denied';
  return 'none';
}

// ---------- Grading ----------

const GRADE_ORDER: Grade[] = ['FAIL', 'WARN', 'INFO'];

export function gradeFindings(obs: Observations, level: GradingLevel): Finding[] {
  const findings: Finding[] = [];

  findings.push(...gradeCookies(obs));
  findings.push(...gradeRequests(obs, level));
  findings.push(...gradeGtm(obs));

  return findings.sort((a, b) => GRADE_ORDER.indexOf(a.severity) - GRADE_ORDER.indexOf(b.severity));
}

function gradeCookies(obs: Observations): Finding[] {
  return [...obs.cookies]
    .sort((a, b) => RANK_ORDER.indexOf(rankOfCookie(a)) - RANK_ORDER.indexOf(rankOfCookie(b)))
    .map((cookie) => {
      const rank = rankOfCookie(cookie);
      const where = `${cookie.name} (${cookie.party}-party @ ${cookie.domain}) matched ${cookie.rule}`;

      if (rank === 'advisory') {
        return {
          severity: 'INFO',
          rule: 'probe-cookie-before-consent',
          detail: `${where}; ${RANK_REASON.advisory}`,
          url: obs.pageUrl,
        };
      }

      return {
        severity: 'FAIL',
        rule: 'cookie-before-consent',
        detail: `${where}; ${rank}: ${RANK_REASON[rank]}`,
        url: obs.pageUrl,
      };
    });
}

function gradeRequests(obs: Observations, level: GradingLevel): Finding[] {
  const googleCookies = obs.cookies.filter(
    (c) => rankOfCookie(c) !== 'advisory' && GOOGLE_COOKIE_CATEGORIES.has(categoryOf(c)),
  );

  // One finding per rule + domain + consent signal, not per ping.
  const groups = new Map<string, { finding: Finding; count: number }>();

  for (const req of obs.trackingRequests) {
    const finding = gradeRequest(req, level, googleCookies);
    const key = `${finding.rule}|${req.domain}|${finding.detail}`;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { finding, count: 1 });
  }

  return [...groups.values()].map(({ finding, count }) => ({
    ...finding,
    detail: `${finding.detail} (${count} request${count === 1 ? '' : 's'})`,
  }));
}

function gradeRequest(req: TrackingRequest, level: GradingLevel, googleCookies: OffendingCookie[]): Finding {
  const url = truncate(req.url);

  if (!GOOGLE_TRACKING_DOMAINS.has(req.domain)) {
    return {
      severity: 'FAIL',
      rule: 'tracking-request-before-consent',
      detail: `${req.domain}: no consent signal exists for non-Google trackers`,
      url,
    };
  }

  const consent = parseGoogleConsent(req.url);
  const state = `${req.domain}, ${consent.signal}`;

  if (consent.state === 'none') {
    return {
      severity: 'FAIL',
      rule: 'google-request-no-consent-signal',
      detail: `${state}: request carries no Consent Mode state`,
      url,
    };
  }

  if (consent.state === 'granted') {
    return {
      severity: 'FAIL',
      rule: 'google-request-consent-granted',
      detail: `${state} (ad_storage ${consent.adStorage}, analytics_storage ${consent.analyticsStorage}): consent granted before the visitor chose`,
      url,
    };
  }

  if (googleCookies.length > 0) {
    return {
      severity: 'FAIL',
      rule: 'google-request-denied-with-cookies',
      detail: `${state}: consent denied but Google cookies set (${googleCookies.map((c) => c.name).join(', ')})`,
      url,
    };
  }

  return {
    severity: level === 'strict' ? 'FAIL' : 'WARN',
    rule: 'google-request-denied-cookieless',
    detail:
      `${state}: Consent Mode advanced cookieless ping. `
      + (level === 'strict'
        ? 'Strict: tags must not load until consent (Consent Mode basic)'
        : 'Accepted under standard, fails under strict'),
    url,
  };
}

function gradeGtm(obs: Observations): Finding[] {
  if (!obs.gtmLoaded) return [];

  const firstTracking = obs.trackingRequests.reduce<number | null>(
    (min, r) => (min === null || r.at < min ? r.at : min),
    null,
  );

  if (!obs.consentDefault) {
    return [{
      severity: 'FAIL',
      rule: 'gtm-no-consent-default',
      detail:
        'GTM loaded with no Consent Mode default=denied. Set '
        + "gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' }) before tags fire",
      url: obs.pageUrl,
    }];
  }

  if (firstTracking !== null && obs.consentDefault.at > firstTracking) {
    return [{
      severity: 'FAIL',
      rule: 'gtm-no-consent-default',
      detail: `Consent Mode default=denied set ${obs.consentDefault.at - firstTracking}ms after the first tracking request`,
      url: obs.pageUrl,
    }];
  }

  return [{
    severity: 'INFO',
    rule: 'gtm-consent-default-first',
    detail: 'GTM loaded, Consent Mode default=denied set before tags fired',
    url: obs.pageUrl,
  }];
}

function truncate(url: string, max = 300): string {
  return url.length > max ? `${url.slice(0, max)}...` : url;
}

// ---------- Level ----------

export function parseCheckLevel(value: string, source: string): CheckLevel {
  const v = value.trim().toLowerCase();
  if ((CHECK_LEVELS as readonly string[]).includes(v)) return v as CheckLevel;
  throw new Error(`${source}="${value}" is not a check level. Use one of: ${CHECK_LEVELS.join(', ')}.`);
}

/** Per-site `checkLevel` wins over GDPR_CHECK_LEVEL, which wins over the default. */
export function resolveCheckLevel(
  siteLevel: string | undefined,
  envLevel: string | undefined,
): { level: CheckLevel; source: string } {
  if (siteLevel) return { level: parseCheckLevel(siteLevel, 'checkLevel'), source: 'site checkLevel' };
  if (envLevel) return { level: parseCheckLevel(envLevel, 'GDPR_CHECK_LEVEL'), source: 'GDPR_CHECK_LEVEL' };
  return { level: DEFAULT_CHECK_LEVEL, source: 'default' };
}

// ---------- Verdict ----------

export type Verdict = 'passed' | 'passed with warnings' | 'failed';

export function verdictOf(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === 'FAIL')) return 'failed';
  if (findings.some((f) => f.severity === 'WARN')) return 'passed with warnings';
  return 'passed';
}

// ---------- Region ----------

export interface RegionInfo {
  inRestricted: boolean;
  /** Country, country-subdivision or Checkly location. UNKNOWN on fallback. */
  region: string;
  source: 'override' | 'GDPR_REGION' | 'checkly-env' | 'ipapi' | 'fallback';
  /** Why the fallback was used. */
  reason?: string;
}

export interface RegionRules {
  restrictedRegions: string[];
  restrictedChecklyLocations: string[];
}

export function isRestrictedRegion(code: string, rules: RegionRules): boolean {
  const upper = code.toUpperCase();
  const country = upper.split('-')[0] ?? upper;
  return rules.restrictedRegions.includes(upper) || rules.restrictedRegions.includes(country);
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export const GEOIP_URL = 'https://ipapi.co/json/';

/**
 * Waterfall: CHECK_IN_RESTRICTED_REGION, GDPR_REGION, CHECKLY_REGION, ipapi.co.
 * Anything unresolved falls back to restricted.
 */
export async function detectRegion(
  rules: RegionRules,
  env: Record<string, string | undefined>,
  fetchImpl: FetchLike,
): Promise<RegionInfo> {
  const override = env.CHECK_IN_RESTRICTED_REGION?.toLowerCase();
  if (override === 'true' || override === 'false') {
    return { inRestricted: override === 'true', region: 'OVERRIDE', source: 'override' };
  }

  const pinned = env.GDPR_REGION?.trim();
  if (pinned) {
    return { inRestricted: isRestrictedRegion(pinned, rules), region: pinned.toUpperCase(), source: 'GDPR_REGION' };
  }

  const checklyRegion = env.CHECKLY_REGION;
  if (checklyRegion) {
    return {
      inRestricted: rules.restrictedChecklyLocations.includes(checklyRegion),
      region: checklyRegion,
      source: 'checkly-env',
    };
  }

  try {
    // Checkly's sandbox has no AbortSignal (fixed in 1.1.0).
    const abortable =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? { signal: AbortSignal.timeout(5_000) }
        : {};

    const key = env.GDPR_GEOIP_API_KEY?.trim();
    const url = key ? `${GEOIP_URL}?key=${encodeURIComponent(key)}` : GEOIP_URL;

    const res = await fetchImpl(url, abortable);
    if (!res.ok) {
      const hint = res.status === 429 && !key ? ', rate limited: set GDPR_GEOIP_API_KEY or GDPR_REGION' : '';
      throw new Error(`ipapi.co returned ${res.status}${hint}`);
    }

    const data = (await res.json()) as { country_code?: string; region_code?: string; error?: boolean; reason?: string };
    // ipapi.co reports quota errors as 200 with { error: true }.
    if (data.error) throw new Error(`ipapi.co error: ${data.reason ?? 'unknown'}`);

    const country = (data.country_code ?? '').toUpperCase();
    if (!country) throw new Error('ipapi.co returned no country_code');

    const sub = data.region_code?.toUpperCase();
    const region = sub ? `${country}-${sub}` : country;
    return { inRestricted: isRestrictedRegion(region, rules), region, source: 'ipapi' };
  } catch (err) {
    return { inRestricted: true, region: 'UNKNOWN', source: 'fallback', reason: (err as Error).message };
  }
}

export function describeRegion(r: RegionInfo): string {
  const restricted = r.inRestricted ? 'restricted' : 'unrestricted';
  if (r.source === 'fallback') {
    return `UNKNOWN via fallback (${r.reason ?? 'no source'}), treated as restricted`;
  }
  return `${r.region} via ${r.source}, ${restricted}`;
}
