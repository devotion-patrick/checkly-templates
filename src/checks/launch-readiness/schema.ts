import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'launch-readiness' as const;
// Bumped whenever this kind's factory/schema logic changes in a way
// that matters to an already-deployed check — i.e. pushing the same
// consumer config again would produce a materially different construct.
// Emitted as a `tmpl-version:<kind>@<version>` tag on every check (see
// @checkly-templates/shared/tags), so a consumer of this registry (e.g.
// a UI that pushes checks) can compare a deployed check's tag against
// this constant to know whether a newer template is available to push.
export const KIND_VERSION = '1.0.0';

// Each check below is independently togglable. Boolean `true` enables the
// check with its default options; an options object enables with overrides;
// omitting the field (or setting `false`) disables that assertion. The
// spec runs every enabled check, accumulates findings, and reports a
// single pass/fail with a human-readable list.
export interface LaunchReadinessChecks {
  /** Body text must not contain any of the listed substrings (case-insensitive).
   *  Default patterns: ["lorem ipsum", "TODO:", "TBD", "Placeholder", "FPO"]. */
  placeholderText?: boolean | { patterns: string[] };

  /** `<link rel="icon">` must exist and its href must return 200. */
  favicon?: boolean;

  /** `<link rel="canonical">` must exist. With expectedUrl, the value must match. */
  canonical?: boolean | { expectedUrl?: string };

  /** Document must have exactly `count` H1 elements (default 1). */
  h1?: boolean | { count: number };

  /** Heading hierarchy must not skip levels (e.g. H1 -> H3 fails). */
  headingOrder?: boolean;

  /** Every `<img>` must have an alt attribute. allowEmptyForDecorative
   *  (default true) lets decorative images use alt="" or role="presentation". */
  imgAlt?: boolean | { allowEmptyForDecorative: boolean };

  /** `<title>` must be non-empty. Optional length bounds enforce SEO guidance. */
  metaTitle?: boolean | { minLength?: number; maxLength?: number };

  /** `<meta name="description">` must be non-empty. Optional length bounds. */
  metaDescription?: boolean | { minLength?: number; maxLength?: number };

  /** Each listed OG property name must have a non-empty meta tag.
   *  og:image's URL is also fetched and verified to return 200. */
  ogTags?: string[];

  /** /robots.txt must return 200 and contain a "User-agent:" directive. */
  robotsTxt?: boolean;

  /** Sitemap must be fetchable + valid XML. spotCheckUrls (default 0)
   *  randomly samples N listed URLs and verifies each returns 2xx. */
  sitemap?: boolean | { path?: string; spotCheckUrls?: number };

  /** Each listed response header must be present on the main page response
   *  (case-insensitive match). Common set:
   *  ["X-Content-Type-Options", "X-Frame-Options", "Strict-Transport-Security",
   *   "Referrer-Policy", "Content-Security-Policy"]. */
  securityHeaders?: string[];

  /** A random non-existent path must return 404 with non-default content
   *  (a body heuristic that avoids matching bare server-default error pages). */
  notFoundPage?: boolean | { probe?: string };

  /** Each substring must appear in at least one network request URL the
   *  page made (page.on('request') captured at navigation). Useful for
   *  asserting GTM/GA/Hotjar/Maps/etc. are present when expected. */
  expectedScripts?: string[];

  /** Every `<form>` must have a g-recaptcha element or a grecaptcha script
   *  reference within its subtree. Disable per-check via this flag. */
  recaptchaOnForms?: boolean;

  /** Replacing the first lowercase letter of the URL path with its uppercase
   *  variant must produce a 301/302 to the lowercase canonical. Skipped if
   *  the URL has no path segment. */
  lowercaseUrls?: boolean;

  /** Either "drop" (URL with trailing slash must redirect to no-slash) or
   *  "add" (no-slash must redirect to trailing-slash). The opposite shape
   *  is also expected to fail with a 3xx, not 200. */
  trailingSlashRedirect?: 'drop' | 'add';

  /** The plain-http variant of this URL's host must 301/302 to https.
   *  Probed regardless of which scheme the configured `url` itself uses. */
  httpsRedirect?: boolean;
}

export interface LaunchReadinessEntry extends CommonEntryFields {
  kind: typeof KIND;
  checks: LaunchReadinessChecks;
  /** waitUntil for the main page.goto. Default "domcontentloaded". */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  /**
   * Some pages perform a client-side (JS) redirect *after* load — e.g. an
   * admin URL that returns 200 then bounces to a login. That navigation
   * destroys the page context mid-check. Default (false): report it as a
   * finding and skip the DOM checks. Set true to follow the redirect and
   * audit the destination page instead.
   */
  followJsRedirect?: boolean;
  /**
   * Whether this URL is expected to be reachable without authentication.
   * Default true (a normal page — non-2xx is a failure).
   *
   * Set false for CMS/admin endpoints that must be gated — e.g. an
   * "/admin" URL that should 401/403, not serve a page:
   *   - a 2xx response is itself the failure ("publicly accessible but
   *     shouldn't be"); no other checks run.
   *   - a non-2xx response (401/403/etc.) is the expected, passing state,
   *     and all other checks are skipped — there's no real page to audit.
   *
   * Set "either" for a CMS/admin endpoint where public-vs-gated is a
   * legitimate per-client choice, not a defect either way (e.g. the
   * client's editors need to log in from arbitrary locations, so there's
   * no IP allowlist or Basic Auth in front). Never fails on accessibility
   * alone; content/SEO checks (canonical, OG tags, sitemap, robots.txt,
   * meta*, images, headings, notFoundPage, redirects) are skipped since
   * they don't apply to a login page, but `securityHeaders` still runs
   * when the page is reachable — those headers matter regardless of
   * whether the endpoint is meant to be public. A 5xx is still a failure.
   */
  expectPubliclyAccessible?: boolean | 'either';
}

// Helper: a JSON-Schema fragment for "boolean OR options object".
function boolOrObject(objectSchema: Record<string, unknown>): Record<string, unknown> {
  return {
    oneOf: [
      { type: 'boolean' },
      { type: 'object', additionalProperties: false, ...objectSchema },
    ],
  };
}

const checksProperties = {
  placeholderText: boolOrObject({
    properties: {
      patterns: { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
    },
    required: ['patterns'],
  }),
  favicon: { type: 'boolean' },
  canonical: boolOrObject({
    properties: {
      expectedUrl: { type: 'string', format: 'uri' },
    },
  }),
  h1: boolOrObject({
    properties: { count: { type: 'integer', minimum: 0 } },
    required: ['count'],
  }),
  headingOrder: { type: 'boolean' },
  imgAlt: boolOrObject({
    properties: { allowEmptyForDecorative: { type: 'boolean' } },
  }),
  metaTitle: boolOrObject({
    properties: {
      minLength: { type: 'integer', minimum: 1 },
      maxLength: { type: 'integer', minimum: 1 },
    },
  }),
  metaDescription: boolOrObject({
    properties: {
      minLength: { type: 'integer', minimum: 1 },
      maxLength: { type: 'integer', minimum: 1 },
    },
  }),
  ogTags: {
    type: 'array',
    items: { type: 'string', minLength: 1, pattern: '^og:' },
    minItems: 1,
  },
  robotsTxt: { type: 'boolean' },
  sitemap: boolOrObject({
    properties: {
      path: { type: 'string', pattern: '^/' },
      spotCheckUrls: { type: 'integer', minimum: 0 },
    },
  }),
  securityHeaders: {
    type: 'array',
    items: { type: 'string', minLength: 1 },
    minItems: 1,
  },
  notFoundPage: boolOrObject({
    properties: { probe: { type: 'string', pattern: '^/' } },
  }),
  expectedScripts: {
    type: 'array',
    items: { type: 'string', minLength: 1 },
    minItems: 1,
  },
  recaptchaOnForms: { type: 'boolean' },
  lowercaseUrls: { type: 'boolean' },
  trailingSlashRedirect: { enum: ['drop', 'add'] },
  httpsRedirect: { type: 'boolean' },
} as const;

export const launchReadinessSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url', 'checks'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    waitUntil: {
      enum: ['load', 'domcontentloaded', 'networkidle'],
      default: 'domcontentloaded',
    },
    followJsRedirect: {
      type: 'boolean',
      default: false,
      description:
        'Follow a client-side (JS) redirect that fires after load (e.g. /admin → login) and audit the destination, instead of reporting the redirect and skipping DOM checks.',
    },
    expectPubliclyAccessible: {
      oneOf: [{ type: 'boolean' }, { const: 'either' }],
      default: true,
      description:
        'Whether this URL should be reachable without authentication. false: must be gated — a 2xx response fails ("publicly accessible but shouldn\'t be"), a non-2xx response passes and skips all other checks. "either": CMS endpoint where public-vs-gated is a legitimate per-client choice — never fails on accessibility, skips content/SEO checks, still runs securityHeaders when reachable (a 5xx still fails).',
    },
    checks: {
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      properties: checksProperties,
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
