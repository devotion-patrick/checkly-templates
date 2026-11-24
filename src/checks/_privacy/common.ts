// Pure helpers shared by the gdpr and ccpa specs. No Playwright import, so node:test can load it.
// Not a workspace package: imported relatively so Checkly's bundler follows it.

// ---------- Levels and findings ----------

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

export function parseCheckLevel(value: string, source: string): CheckLevel {
  const v = value.trim().toLowerCase();
  if ((CHECK_LEVELS as readonly string[]).includes(v)) return v as CheckLevel;
  throw new Error(`${source}="${value}" is not a check level. Use one of: ${CHECK_LEVELS.join(', ')}.`);
}

/** Per-site `checkLevel` wins over the env var, which wins over the default. */
export function resolveCheckLevel(
  siteLevel: string | undefined,
  envLevel: string | undefined,
  envName: string,
): { level: CheckLevel; source: string } {
  if (siteLevel) return { level: parseCheckLevel(siteLevel, 'checkLevel'), source: 'site checkLevel' };
  if (envLevel) return { level: parseCheckLevel(envLevel, envName), source: envName };
  return { level: DEFAULT_CHECK_LEVEL, source: 'default' };
}

export type Verdict = 'passed' | 'passed with warnings' | 'failed';

export function verdictOf(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === 'FAIL')) return 'failed';
  if (findings.some((f) => f.severity === 'WARN')) return 'passed with warnings';
  return 'passed';
}

const GRADE_ORDER: Grade[] = ['FAIL', 'WARN', 'INFO'];

export function sortByGrade(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => GRADE_ORDER.indexOf(a.severity) - GRADE_ORDER.indexOf(b.severity));
}

export function truncate(url: string, max = 300): string {
  return url.length > max ? `${url.slice(0, max)}...` : url;
}

// ---------- Enforcement ----------

/** report grades with the standard table. */
export function gradingLevelFor(level: CheckLevel): GradingLevel {
  return level === 'report' ? 'standard' : level;
}

/** Report never fails; `regionEnforces` is false for a targeted run outside a restricted region. */
export function shouldEnforce(level: CheckLevel, regionEnforces = true): boolean {
  return level !== 'report' && regionEnforces;
}

// ---------- Checkly run location ----------

// e.g. us-west-1, ap-southeast-1, eu-central-1.
const CHECKLY_LOCATION = /^[a-z]{2}-[a-z]+-\d$/;

/**
 * Run location from Checkly's runtime: CHECKLY_REGION on Playwright Check
 * Suites, REGION on browser checks. REGION is a generic name, so only
 * trusted when it looks like a Checkly location.
 */
export function checklyRegionFrom(env: Record<string, string | undefined>): string | undefined {
  const suite = env.CHECKLY_REGION?.trim();
  if (suite) return suite;

  const browser = env.REGION?.trim();
  return browser && CHECKLY_LOCATION.test(browser) ? browser : undefined;
}

// ---------- Domains ----------

const TWO_LABEL_TLDS = new Set([
  'co.uk', 'co.nz', 'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.jp', 'com.sg', 'com.hk',
]);

export function registrableDomain(host: string): string {
  if (!host) return '';
  const parts = host.toLowerCase().split('.');
  if (parts.length < 2) return host.toLowerCase();
  const last2 = parts.slice(-2).join('.');
  if (parts.length >= 3 && TWO_LABEL_TLDS.has(last2)) {
    return parts.slice(-3).join('.');
  }
  return last2;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** The list entry `host` equals or sits under, e.g. `bat.bing.com` for `bat.bing.com` or `x.bat.bing.com`. */
export function matchDomain(host: string, domains: Iterable<string>): string | null {
  const h = host.toLowerCase();
  for (const d of domains) {
    const entry = d.toLowerCase();
    if (h === entry || h.endsWith(`.${entry}`)) return entry;
  }
  return null;
}

// ---------- Cookies ----------

/** `category:pattern` of the first match. Patterns ending in `*` are a prefix match. */
export function matchCookie(name: string, blocklist: Record<string, readonly string[]>): string | null {
  for (const [category, patterns] of Object.entries(blocklist)) {
    for (const pattern of patterns) {
      if (pattern.endsWith('*')) {
        if (name.startsWith(pattern.slice(0, -1))) return `${category}:${pattern}`;
      } else if (name === pattern) {
        return `${category}:${pattern}`;
      }
    }
  }
  return null;
}

// ---------- Google Consent Mode ----------

export type StorageState = 'denied' | 'granted' | 'unset';

export interface GoogleConsentSignal {
  /** e.g. `gcs=G100`, `gcd=13p3p3p2p5l1`, or `no gcs/gcd` */
  signal: string;
  adStorage: StorageState;
  analyticsStorage: StorageState;
  /** gcd only; gcs doesn't carry them. */
  adUserData: StorageState;
  adPersonalization: StorageState;
}

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
 * Consent Mode state from a Google hit. gcs wins for ad_storage and
 * analytics_storage: it's the effective state, gcd the history behind it.
 */
export function parseGoogleConsentSignal(url: string): GoogleConsentSignal {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return noSignal();
  }

  const gcd = params.get('gcd');
  // Two-char prefix, then one letter per type: ad_storage, analytics_storage, ad_user_data, ad_personalization.
  const letters = gcd && gcd.length > 2 ? gcd.slice(2).match(/[a-z]/gi) ?? [] : [];
  const fromGcd = (i: number): StorageState => GCD_LETTER[(letters[i] ?? '').toLowerCase()] ?? 'unset';

  const gcs = params.get('gcs');
  const gcsMatch = gcs ? /^G1([01])([01])$/.exec(gcs) : null;
  if (gcsMatch) {
    return {
      signal: `gcs=${gcs}`,
      adStorage: gcsMatch[1] === '1' ? 'granted' : 'denied',
      analyticsStorage: gcsMatch[2] === '1' ? 'granted' : 'denied',
      adUserData: fromGcd(2),
      adPersonalization: fromGcd(3),
    };
  }

  if (letters.length > 0) {
    return {
      signal: `gcd=${gcd}`,
      adStorage: fromGcd(0),
      analyticsStorage: fromGcd(1),
      adUserData: fromGcd(2),
      adPersonalization: fromGcd(3),
    };
  }

  return noSignal();
}

function noSignal(): GoogleConsentSignal {
  return { signal: 'no gcs/gcd', adStorage: 'unset', analyticsStorage: 'unset', adUserData: 'unset', adPersonalization: 'unset' };
}
