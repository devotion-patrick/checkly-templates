// Default GDPR rule set covering EU/EEA member states, UK, and California.
// Consumers can override these by setting `preset: "none"` and supplying
// their own `rules`, or by surgically adding/removing entries via
// `overrides`.

export const restrictedRegions: ReadonlySet<string> = new Set([
  // EU/EEA member states (ISO 3166-1 alpha-2).
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // UK GDPR.
  'GB',
  // EEA non-EU.
  'IS', 'LI', 'NO',
  // CCPA / California - matched via the US-CA combo in the check itself.
  'US-CA',
]);

// Checkly public locations whose data plane sits inside a restricted
// region. Used as a fast path when `CHECKLY_REGION` is exposed at runtime.
export const restrictedChecklyLocations: ReadonlySet<string> = new Set([
  'eu-central-1', // Frankfurt
  'eu-west-1',    // Dublin
  'eu-west-2',    // London
  'eu-west-3',    // Paris
  'eu-north-1',   // Stockholm
  'eu-south-1',   // Milan
  'us-west-1',    // N. California
]);

// Outbound request domains that are tracking by their very presence.
// GTM is handled separately because it CAN be compliant when paired with
// a consent-mode default=denied call.
export const trackingDomains: ReadonlySet<string> = new Set([
  'google-analytics.com',
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'connect.facebook.net',
  'facebook.net',
  'bat.bing.com',
  'analytics.tiktok.com',
  'snap.licdn.com',
  'ct.pinterest.com',
  'static.hotjar.com',
  'js.hs-analytics.net',
  'js.hs-scripts.com',
  'track.hubspot.com',
  // Standard YouTube embed - violates compliance. youtube-nocookie.com
  // (the compliant variant) and ytimg.com (static thumbnails) are
  // intentionally NOT here.
  'youtube.com',
  'googlevideo.com',
]);

export const gtmDomain = 'googletagmanager.com';

// Cookie-name patterns considered non-essential if set before consent.
// Patterns ending in `*` are a prefix match; otherwise exact match.
export const cookieBlocklist: Record<string, readonly string[]> = {
  google_analytics: ['_ga', '_ga_*', '_gid', '_gat', '_gat_*'],
  google_ads: ['_gcl_au', '_gcl_aw', '_gcl_dc', '_gcl_gb', '_gcl_gs', '_gcl_ha', '_gac_*'],
  meta: ['_fbp', '_fbc', 'fr'],
  google_doubleclick: ['IDE', 'DSID', 'test_cookie'],
  bing: ['_uetsid', '_uetvid', 'MUID'],
  linkedin: ['li_sugr', 'bcookie', 'lidc', 'UserMatchHistory', 'AnalyticsSyncHistory'],
  tiktok: ['_tt_enable_cookie', '_ttp'],
  pinterest: ['_pin_unauth', '_pinterest_ct_ua'],
  hotjar: ['_hj*'],
  hubspot: ['__hs*', 'hubspotutk', '__hstc', '__hssc'],
  // YouTube standard embed cookies (use youtube-nocookie.com to avoid).
  youtube: ['VISITOR_INFO1_LIVE', 'YSC', '__Secure-YEC', 'LOGIN_INFO', 'SOCS', 'VISITOR_PRIVACY_METADATA', 'wide'],
  // Cookies that ride along with Google services (YouTube, Maps, Fonts).
  google_shared: ['PREF', 'NID'],
};

export interface GdprPreset {
  restrictedRegions: ReadonlySet<string>;
  restrictedChecklyLocations: ReadonlySet<string>;
  trackingDomains: ReadonlySet<string>;
  gtmDomain: string;
  cookieBlocklist: Record<string, readonly string[]>;
}

export const euUkCaPreset: GdprPreset = {
  restrictedRegions,
  restrictedChecklyLocations,
  trackingDomains,
  gtmDomain,
  cookieBlocklist,
};
