// Default rule set for the ccpa kind (California, CCPA as amended by CPRA).
// Consumers adjust it through `overrides`. Rationale: src/checks/ccpa/README.md.

import { cookieBlocklist as gdprCookieBlocklist } from './gdpr-eu-uk-ca.ts';

// Checkly locations inside California. The check only means something from here:
// sites geo-gate their CCPA behaviour on the visitor's IP.
export const californiaChecklyLocations: ReadonlySet<string> = new Set(['us-west-1']);

// Sale or sharing for cross-context behavioural advertising. Matched on host and subdomains.
export const adTechDomains: ReadonlySet<string> = new Set([
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'facebook.net',
  'facebook.com',
  'bat.bing.com',
  'analytics.tiktok.com',
  'snap.licdn.com',
  'px.ads.linkedin.com',
  'ct.pinterest.com',
]);

// Measurement that can sit under a service-provider contract, so not a sale by itself.
export const analyticsDomains: ReadonlySet<string> = new Set([
  'google-analytics.com',
  'static.hotjar.com',
  'script.hotjar.com',
  'js.hs-analytics.net',
  'track.hubspot.com',
]);

// Advertising identifiers, taken from the gdpr preset. test_cookie dropped: it stores no identifier.
const AD_CATEGORIES = ['google_ads', 'meta', 'google_doubleclick', 'bing', 'linkedin', 'tiktok', 'pinterest'];

export const adCookieBlocklist: Record<string, readonly string[]> = Object.fromEntries(
  AD_CATEGORIES.map((category) => [
    category,
    (gdprCookieBlocklist[category] ?? []).filter((name) => name !== 'test_cookie'),
  ]),
);

// Lower-case substrings of the opt-out link's text, aria-label or title.
// Covers "Do Not Sell or Share My Personal Information" and the "Your Privacy Choices" alternative.
export const optOutLinkPatterns: readonly string[] = [
  'do not sell',
  'do not share',
  'privacy choices',
  'opt out of sale',
  'opt-out of sale',
  'opt out of sharing',
  'opt-out of sharing',
];

export interface CcpaPreset {
  californiaChecklyLocations: ReadonlySet<string>;
  adTechDomains: ReadonlySet<string>;
  analyticsDomains: ReadonlySet<string>;
  adCookieBlocklist: Record<string, readonly string[]>;
  optOutLinkPatterns: readonly string[];
}

export const ccpaCaPreset: CcpaPreset = {
  californiaChecklyLocations,
  adTechDomains,
  analyticsDomains,
  adCookieBlocklist,
  optOutLinkPatterns,
};
