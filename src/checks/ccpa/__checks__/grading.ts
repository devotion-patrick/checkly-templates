// Pure grading for the CCPA spec. No Playwright import, so node:test can load it.
// Grading table and rationale: src/checks/ccpa/README.md#grading.

import {
  type CheckLevel,
  type Finding,
  type GradingLevel,
  matchDomain,
  parseGoogleConsentSignal,
  registrableDomain,
  hostnameOf,
  resolveCheckLevel as resolveSharedCheckLevel,
  sortByGrade,
  truncate,
} from '../../_privacy/common.ts';

export {
  gradingLevelFor,
  shouldEnforce,
  verdictOf,
  type CheckLevel,
  type Finding,
  type Grade,
  type GradingLevel,
  type Verdict,
} from '../../_privacy/common.ts';

export interface ObservedRequest {
  url: string;
  /** Playwright resource type; `script` is a loader, anything else a hit. */
  resourceType: string;
}

export interface ObservedCookie {
  name: string;
  domain: string;
  /** `category:pattern`, as the blocklist is keyed. */
  rule: string;
}

/** What the page's CMP reports through its privacy APIs. */
export interface PrivacyStrings {
  /** IAB US Privacy string, e.g. `1YYN`. */
  usp?: string;
  gppString?: string;
  /** `parsedSections` from `__gpp('ping')`, when the CMP provides it. */
  gppParsed?: Record<string, Record<string, unknown>>;
}

export interface PassObservations {
  requests: ObservedRequest[];
  adCookies: ObservedCookie[];
  privacy: PrivacyStrings;
}

export interface OptOutLink {
  found: boolean;
  /** How it was found, e.g. `text "do not sell"` or `selector #ot-sdk-btn`. */
  via?: string;
}

export interface Observations {
  pageUrl: string;
  adTechDomains: string[];
  analyticsDomains: string[];
  baseline: PassObservations;
  gpc: PassObservations;
  optOutLink: OptOutLink;
}

// ---------- Level ----------

/** Per-site `checkLevel` wins over CCPA_CHECK_LEVEL, which wins over the default. */
export function resolveCheckLevel(
  siteLevel: string | undefined,
  envLevel: string | undefined,
): { level: CheckLevel; source: string } {
  return resolveSharedCheckLevel(siteLevel, envLevel, 'CCPA_CHECK_LEVEL');
}

// ---------- Vendors and restricted-processing signals ----------

// Hosts that belong to one vendor, so a script on one and hits on another grade together.
const VENDOR_OF: Record<string, string> = {
  'facebook.com': 'meta',
  'facebook.net': 'meta',
  'doubleclick.net': 'google-ads',
  'googleadservices.com': 'google-ads',
  'googlesyndication.com': 'google-ads',
};

export function vendorOf(matchedDomain: string): string {
  return VENDOR_OF[registrableDomain(matchedDomain)] ?? matchedDomain;
}

/**
 * The vendor's own CCPA restriction flag on a hit, or null.
 * Floodlight puts params in the path (`;rdp=1`), so match on the whole URL.
 */
export function restrictionSignal(url: string): string | null {
  const vendor = vendorOf(registrableDomain(hostnameOf(url)));

  if (vendor === 'meta') {
    return /[?&]dpo=LDU(?:&|$)/i.test(url) ? 'dpo=LDU' : null;
  }

  if (vendor === 'google-ads') {
    if (/[?&;]rdp=1(?:[&;]|$)/.test(url)) return 'rdp=1';
    if (/[?&;]npa=1(?:[&;]|$)/.test(url)) return 'npa=1';
    const c = parseGoogleConsentSignal(url);
    if (c.adStorage === 'denied' || c.adUserData === 'denied' || c.adPersonalization === 'denied') {
      return `${c.signal} (ad consent denied)`;
    }
  }

  return null;
}

// ---------- Privacy strings ----------

export type PrivacyOptOut = 'opted-out' | 'not-opted-out' | 'unknown' | 'absent';

/** Whether the CMP's GPP or US Privacy string records a sale or sharing opt-out. */
export function privacyOptOut(p: PrivacyStrings): PrivacyOptOut {
  const optedOut: boolean[] = [];

  // GPP US sections: 1 = opted out, 2 = did not opt out, 0 = not applicable.
  for (const section of ['usca', 'usnat']) {
    const s = p.gppParsed?.[section];
    if (!s) continue;
    const values = [s.SaleOptOut, s.SharingOptOut].filter((v) => v === 1 || v === 2);
    if (values.length) optedOut.push(values.includes(1));
  }

  // US Privacy: third character is the sale opt-out, Y or N.
  if (p.usp && /^1[YN-][YN-][YN-]$/i.test(p.usp) && p.usp[2] !== '-') {
    optedOut.push(p.usp[2]!.toUpperCase() === 'Y');
  }

  if (optedOut.length) return optedOut.includes(true) ? 'opted-out' : 'not-opted-out';
  if (p.gppString || p.usp) return 'unknown';
  return 'absent';
}

// ---------- Grading ----------

export function gradeFindings(obs: Observations, level: GradingLevel): Finding[] {
  return sortByGrade([
    ...gradeGpcAdTech(obs, level),
    ...gradeGpcAdCookies(obs),
    ...gradeOptOutLink(obs),
    ...gradeGpcAnalytics(obs, level),
    ...gradeBaseline(obs),
    ...gradePrivacyStrings(obs),
  ]);
}

function matches(req: ObservedRequest, domains: string[]): string | null {
  return matchDomain(hostnameOf(req.url), domains);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function gradeGpcAdTech(obs: Observations, level: GradingLevel): Finding[] {
  const byVendor = new Map<string, ObservedRequest[]>();
  for (const req of obs.gpc.requests) {
    const matched = matches(req, obs.adTechDomains);
    if (!matched) continue;
    const vendor = vendorOf(matched);
    byVendor.set(vendor, [...(byVendor.get(vendor) ?? []), req]);
  }

  const findings: Finding[] = [];

  for (const [vendor, reqs] of byVendor) {
    const hits = reqs.filter((r) => r.resourceType !== 'script');

    if (hits.length === 0) {
      findings.push({
        // No data sent beyond the script fetch, so at least as acceptable as flagged hits.
        severity: level === 'strict' ? 'FAIL' : 'INFO',
        rule: 'ad-script-after-gpc',
        detail:
          `${vendor}: ${plural(reqs.length, 'script')} loaded after GPC, no hits sent. `
          + (level === 'strict' ? 'Strict: the script fetch still discloses IP and device data' : 'Accepted under standard, fails under strict'),
        url: truncate(reqs[0]!.url),
      });
      continue;
    }

    const unrestricted = hits.filter((r) => restrictionSignal(r.url) === null);

    if (unrestricted.length > 0) {
      findings.push({
        severity: 'FAIL',
        rule: 'sale-after-gpc',
        detail: `${vendor}: ${plural(unrestricted.length, 'hit')} after GPC with no restricted-processing signal`,
        url: truncate(unrestricted[0]!.url),
      });
      continue;
    }

    const signals = [...new Set(hits.map((r) => restrictionSignal(r.url)))].join(', ');
    findings.push({
      // Standard accepts it, so INFO: a WARN would report the run Degraded.
      severity: level === 'strict' ? 'FAIL' : 'INFO',
      rule: 'restricted-processing-after-gpc',
      detail:
        `${vendor}: ${plural(hits.length, 'hit')} after GPC, all flagged ${signals}. `
        + (level === 'strict' ? 'Strict: the hit still discloses IP and device data' : 'Accepted under standard, fails under strict'),
      url: truncate(hits[0]!.url),
    });
  }

  return findings;
}

function gradeGpcAdCookies(obs: Observations): Finding[] {
  return obs.gpc.adCookies.map((c) => ({
    severity: 'FAIL',
    rule: 'ad-cookie-after-gpc',
    detail: `${c.name} (@ ${c.domain}) matched ${c.rule}`,
    url: obs.pageUrl,
  }));
}

function gradeOptOutLink(obs: Observations): Finding[] {
  if (obs.optOutLink.found) {
    return [{ severity: 'INFO', rule: 'opt-out-link', detail: `found via ${obs.optOutLink.via}`, url: obs.pageUrl }];
  }

  const adSeen =
    obs.baseline.adCookies.length > 0 || obs.baseline.requests.some((r) => matches(r, obs.adTechDomains));

  if (adSeen) {
    return [{
      severity: 'FAIL',
      rule: 'no-opt-out-link',
      detail: 'ad-tech seen before opt-out but no "Do Not Sell or Share" or "Your Privacy Choices" link found',
      url: obs.pageUrl,
    }];
  }

  return [{
    severity: 'INFO',
    rule: 'no-opt-out-link-no-sale-seen',
    detail: 'no opt-out link, and no ad-tech seen to need one',
    url: obs.pageUrl,
  }];
}

function gradeGpcAnalytics(obs: Observations, level: GradingLevel): Finding[] {
  const domains = new Map<string, number>();
  for (const req of obs.gpc.requests) {
    const matched = matches(req, obs.analyticsDomains);
    if (matched) domains.set(matched, (domains.get(matched) ?? 0) + 1);
  }

  return [...domains].map(([domain, count]) => ({
    severity: level === 'strict' ? 'WARN' : 'INFO',
    rule: 'analytics-after-gpc',
    detail:
      `${domain}: ${plural(count, 'request')} after GPC. Not a sale under a service-provider contract`
      + (level === 'strict' ? ', which the check cannot see' : ''),
    url: obs.pageUrl,
  }));
}

function gradeBaseline(obs: Observations): Finding[] {
  const domains = new Set<string>();
  for (const req of obs.baseline.requests) {
    const matched = matches(req, [...obs.adTechDomains, ...obs.analyticsDomains]);
    if (matched) domains.add(matched);
  }
  if (domains.size === 0) return [];

  return [{
    severity: 'INFO',
    rule: 'tracking-before-opt-out',
    detail: `allowed under CCPA: ${[...domains].join(', ')}`,
    url: obs.pageUrl,
  }];
}

function gradePrivacyStrings(obs: Observations): Finding[] {
  const state = privacyOptOut(obs.gpc.privacy);
  const strings = [
    obs.gpc.privacy.gppString ? `GPP ${truncate(obs.gpc.privacy.gppString, 60)}` : '',
    obs.gpc.privacy.usp ? `USP ${obs.gpc.privacy.usp}` : '',
  ].filter(Boolean).join(', ');

  switch (state) {
    case 'opted-out':
      return [{ severity: 'INFO', rule: 'gpp-opt-out-recorded', detail: `CMP recorded the GPC opt-out (${strings})`, url: obs.pageUrl }];
    case 'not-opted-out':
      return [{ severity: 'WARN', rule: 'gpp-opt-out-missing', detail: `CMP did not record the GPC opt-out (${strings})`, url: obs.pageUrl }];
    case 'unknown':
      return [{ severity: 'INFO', rule: 'privacy-string-unparsed', detail: `privacy string present but not decoded (${strings})`, url: obs.pageUrl }];
    default:
      return [];
  }
}
