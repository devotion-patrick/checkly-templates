// Checkly PlaywrightCheck — structural launch-audit assertions.
//
// Env contract (set by launch-readiness/factory.ts):
//   CHECK_KIND        — must equal "launch-readiness" for this spec to enforce.
//   CHECK_TARGET_URL  — absolute URL to load.
//   CHECK_PARAMS      — JSON: { waitUntil, checks: LaunchReadinessChecks }
//
// Design notes:
//   - We collect ALL DOM-side data in one page.evaluate() up front so
//     the spec doesn't pay Playwright's 30s-per-locator wait when an
//     element is missing. The browser-side function returns a single
//     snapshot; assertions run synchronously against it.
//   - Network probes (favicon fetch, robots.txt, sitemap, 404 probe,
//     redirect probes, og:image fetch) each get a 10s cap so a slow or
//     hung endpoint can't blow the spec budget. Independent probes run
//     in parallel via Promise.all.
//   - Every enabled check runs; findings accumulate into a single
//     Error at the end. No first-fail short-circuit — multi-issue
//     audits should report the whole punch list.

import { test, type APIRequestContext, type Request, type Response } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> };

const KIND = 'launch-readiness';
const CHECK_KIND = process.env.CHECK_KIND ?? '';
const isOurKind = CHECK_KIND === KIND;

if (!isOurKind) {
  test.skip(`launch-readiness spec skipped (CHECK_KIND=${CHECK_KIND || '<unset>'})`, () => {});
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Required environment variable ${name} is not set.`);
  }
  return v;
}

interface CheckParams {
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle';
  followJsRedirect?: boolean;
  expectPubliclyAccessible?: boolean | 'either';
  checks: LaunchReadinessChecks;
}

interface LaunchReadinessChecks {
  placeholderText?: boolean | { patterns: string[] };
  favicon?: boolean;
  canonical?: boolean | { expectedUrl?: string };
  h1?: boolean | { count: number };
  headingOrder?: boolean;
  imgAlt?: boolean | { allowEmptyForDecorative: boolean };
  metaTitle?: boolean | { minLength?: number; maxLength?: number };
  metaDescription?: boolean | { minLength?: number; maxLength?: number };
  ogTags?: string[];
  robotsTxt?: boolean;
  sitemap?: boolean | { path?: string; spotCheckUrls?: number };
  securityHeaders?: string[];
  notFoundPage?: boolean | { probe?: string };
  expectedScripts?: string[];
  recaptchaOnForms?: boolean;
  lowercaseUrls?: boolean;
  trailingSlashRedirect?: 'drop' | 'add';
  httpsRedirect?: boolean;
}

interface DomSnapshot {
  bodyText: string;
  faviconHref: string | null;
  canonicalHref: string | null;
  h1Count: number;
  headingLevels: number[];
  imgsMissingAlt: Array<{ src: string; reason: 'missing' | 'empty-not-decorative' }>;
  title: string;
  metaDescription: string;
  ogTagContents: Record<string, string | null>;
  formCount: number;
  formsWithoutRecaptcha: number[];
  hasGlobalGrecaptchaScript: boolean;
}

const DEFAULT_PLACEHOLDER_PATTERNS = ['lorem ipsum', 'TODO:', 'TBD', 'Placeholder', 'FPO'];
const DEFAULT_NOT_FOUND_PROBE = '/__launch-readiness-probe-does-not-exist__';
const DEFAULT_SITEMAP_PATH = '/sitemap.xml';
const PROBE_TIMEOUT_MS = 10_000;

const TARGET_URL = isOurKind ? requireEnv('CHECK_TARGET_URL') : '';
const CHECK_PARAMS = isOurKind ? (JSON.parse(requireEnv('CHECK_PARAMS')) as CheckParams) : null;

function originOf(url: string): string {
  return new URL(url).origin;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

// Raw HTML <title> text (from a fetched-not-rendered response) needs
// entity-decoding before it's comparable to the DOM's already-decoded
// document.title; both also get whitespace-collapsed since templates
// commonly leave stray double spaces around interpolated values.
function normalizeTitle(raw: string): string {
  return raw
    .replace(/&(#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code.startsWith('#')) return String.fromCharCode(Number(code.slice(1)));
      return HTML_ENTITIES[code.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function isEnabled(opt: unknown): boolean {
  return opt === true || (typeof opt === 'object' && opt !== null);
}

function asOpts<T extends object>(opt: boolean | T | undefined, defaults: T): T {
  if (opt === true || opt === undefined) return defaults;
  if (opt === false) return defaults; // (caller gates with isEnabled first)
  return { ...defaults, ...(opt as T) };
}

async function probe(
  request: APIRequestContext,
  url: string,
  opts: { maxRedirects?: number } = {},
): Promise<{ status: number | null; headers: Record<string, string>; text: () => Promise<string> } | null> {
  try {
    const res = await request.get(url, { timeout: PROBE_TIMEOUT_MS, ...opts });
    return {
      status: res.status(),
      headers: res.headers(),
      text: () => res.text(),
    };
  } catch {
    return null;
  }
}

test('launch readiness', async ({ page, request }) => {
  test.setTimeout(240_000);
  if (!isOurKind || !CHECK_PARAMS) return;

  const { waitUntil, followJsRedirect, checks } = CHECK_PARAMS;
  const expectPubliclyAccessible = CHECK_PARAMS.expectPubliclyAccessible ?? true;
  const findings: string[] = [];
  const warnings: string[] = [];
  const note = (msg: string) => findings.push(msg);
  const warn = (msg: string) => warnings.push(msg);

  // Single reporting exit point: logs the human-readable findings/warnings
  // list plus one machine-readable LAUNCH_READINESS_RESULT line (consumed
  // by tooling that aggregates results across many sites, e.g. a report
  // generator), then throws iff there's at least one finding. Every exit
  // path below funnels through this instead of repeating the same
  // console.log + throw shape.
  const reportAndMaybeThrow = (httpStatus: number | null): void => {
    console.log(`Launch readiness for ${TARGET_URL}:`);
    console.log(`  findings: ${findings.length}`);
    for (const f of findings) console.log(`    - ${f}`);
    console.log(`  warnings: ${warnings.length}`);
    for (const w of warnings) console.log(`    - ${w}`);
    console.log('LAUNCH_READINESS_RESULT ' + JSON.stringify({ url: TARGET_URL, httpStatus, findings, warnings }));

    if (findings.length > 0) {
      const warningsBlock = warnings.length
        ? `\n\nWarnings (non-blocking, ${warnings.length}):\n` + warnings.map((w) => `  - ${w}`).join('\n')
        : '';
      throw new Error(
        `Launch readiness failed for ${TARGET_URL} (${findings.length} finding${findings.length === 1 ? '' : 's'}):\n\n` +
          findings.map((f) => `  - ${f}`).join('\n') +
          warningsBlock,
      );
    }
  };

  // Capture request URLs for the `expectedScripts` assertion.
  const requestUrls: string[] = [];
  page.on('request', (req: Request) => requestUrls.push(req.url()));

  const mainResponse: Response | null = await page.goto(TARGET_URL, { waitUntil, timeout: 30_000 });
  if (!mainResponse) {
    throw new Error(`Could not load ${TARGET_URL} (no response).`);
  }

  const mainStatus = mainResponse.status();
  const isAccessible = mainStatus >= 200 && mainStatus < 300;
  const mainHeaders = mainResponse.headers();

  // expectPubliclyAccessible: false marks a URL that should require auth
  // (e.g. a CMS admin login). Its pass/fail sense is the opposite of a
  // normal page: reachable-without-auth IS the failure, and correctly
  // being gated means there's no real page to run the rest of the checks
  // against.
  if (expectPubliclyAccessible === false) {
    if (isAccessible) {
      const { hasPasswordField, title } = await page.evaluate(() => ({
        hasPasswordField: document.querySelector('input[type="password"]') !== null,
        title: document.title || '',
      }));

      // Checked before the password-field signal: "is this route actually
      // just falling back to the homepage" (broken/misconfigured routing)
      // is the more specific, more informative diagnosis when it applies —
      // and a much lower-severity problem (duplicate-content SEO risk)
      // than a genuinely exposed CMS, so it's a warning rather than a
      // finding. Raw HTML <title> needs entity-decoding + whitespace
      // normalization before comparing against the DOM's decoded title.
      const homepageRes = await probe(request, originOf(TARGET_URL));
      const homepageTitleRaw = homepageRes ? (await homepageRes.text()).match(/<title>([^<]*)<\/title>/i)?.[1] : null;
      const homepageTitle = homepageTitleRaw ? normalizeTitle(homepageTitleRaw) : null;

      if (homepageTitle && homepageTitle === normalizeTitle(title)) {
        warn(
          `Returned HTTP ${mainStatus} but the content is identical to the homepage, not a CMS login — likely a broken/misconfigured route rather than an exposed admin panel (still a duplicate-content SEO risk).`,
        );
      } else if (hasPasswordField) {
        // A real login form is reachable without any network-level gate —
        // the CMS itself is exposed. Full-severity finding.
        note(`Expected this endpoint to require authentication, but a login form is publicly reachable (HTTP ${mainStatus}).`);
      } else {
        note(
          `Expected this endpoint to require authentication, but it returned HTTP ${mainStatus} with content that doesn't look like a login page (investigate manually).`,
        );
      }
    }
    reportAndMaybeThrow(mainStatus);
    return;
  }

  // expectPubliclyAccessible: 'either' marks a CMS/admin endpoint where
  // public-vs-gated is a legitimate per-client choice (e.g. editors need
  // to log in from arbitrary locations), not a defect either way. Content
  // and SEO checks don't apply to a login page, so only securityHeaders
  // runs — that's meaningful regardless of whether the endpoint is meant
  // to be public. A 5xx is still a real failure.
  if (expectPubliclyAccessible === 'either') {
    if (mainStatus >= 500) {
      note(`Returned HTTP ${mainStatus} — server error.`);
    } else if (isAccessible && checks.securityHeaders && checks.securityHeaders.length > 0) {
      const lowerKeys = Object.keys(mainHeaders).map((k) => k.toLowerCase());
      for (const want of checks.securityHeaders) {
        if (!lowerKeys.includes(want.toLowerCase())) {
          note(`Response header "${want}" is missing.`);
        }
      }
    }
    reportAndMaybeThrow(mainStatus);
    return;
  }

  // Only audit pages that actually serve a 2xx. Non-200 endpoints (e.g. an
  // unexpectedly auth-gated page) lack security headers and real content
  // by design, so running the header/content checks against them produces
  // misleading failures. Report the status and skip the rest.
  if (!isAccessible) {
    note(`Returned HTTP ${mainStatus} (expected 200) — header & content checks skipped.`);
    reportAndMaybeThrow(mainStatus);
    return;
  }

  // Resolved (post-redirect) origin, not TARGET_URL's own scheme/host —
  // e.g. a configured http:// URL that immediately 301s to https would
  // otherwise make every path-based probe below (404, robots.txt, sitemap,
  // lowercase/trailing-slash redirects) hit that same http->https hop
  // instead of the actual page it's meant to test.
  const origin = originOf(mainResponse.url());

  // ---------- DOM snapshot (single browser-side pass) ----------
  // Pre-compute every DOM-side fact we need so each assertion below is
  // a synchronous data check, not a 30s-per-missing-element Playwright
  // wait. The browser function returns null where appropriate; we make
  // sense of the data on the Node side.
  const ogTagsRequested = checks.ogTags ?? [];
  const imgAltOpts = asOpts(
    isEnabled(checks.imgAlt) ? checks.imgAlt : false,
    { allowEmptyForDecorative: true },
  );
  const captureDom = (): Promise<DomSnapshot> => page.evaluate(
    ({ ogTagsRequested, allowEmptyForDecorative }) => {
      const $ = (sel: string) => document.querySelector(sel);
      const $$ = (sel: string) => Array.from(document.querySelectorAll(sel));

      const ogTagContents: Record<string, string | null> = {};
      for (const tag of ogTagsRequested) {
        const el = document.querySelector(`meta[property="${tag}"]`);
        ogTagContents[tag] = el ? el.getAttribute('content') : null;
      }

      const imgsMissingAlt = ($$('img') as HTMLImageElement[])
        .map((img) => {
          const alt = img.getAttribute('alt');
          const role = img.getAttribute('role');
          if (alt === null) {
            return { src: img.getAttribute('src') ?? '<no src>', reason: 'missing' as const };
          }
          if (alt === '' && !allowEmptyForDecorative && role !== 'presentation') {
            return { src: img.getAttribute('src') ?? '<no src>', reason: 'empty-not-decorative' as const };
          }
          return null;
        })
        .filter((x): x is { src: string; reason: 'missing' | 'empty-not-decorative' } => x !== null)
        .slice(0, 10);

      const forms = $$('form') as HTMLFormElement[];
      const hasGlobalGrecaptchaScript =
        document.querySelector('script[src*="recaptcha"], script[src*="grecaptcha"]') !== null;
      const formsWithoutRecaptcha = forms
        .map((form, idx) => {
          const hasGRecaptchaEl =
            form.querySelector('.g-recaptcha, [data-sitekey]') !== null;
          return hasGRecaptchaEl || hasGlobalGrecaptchaScript ? null : idx;
        })
        .filter((x): x is number => x !== null);

      return {
        bodyText: document.body?.innerText ?? '',
        faviconHref: $('link[rel~="icon"]')?.getAttribute('href') ?? null,
        canonicalHref: $('link[rel="canonical"]')?.getAttribute('href') ?? null,
        h1Count: $$('h1').length,
        headingLevels: $$('h1, h2, h3, h4, h5, h6').map((el) =>
          Number((el as HTMLElement).tagName.substring(1)),
        ),
        imgsMissingAlt,
        title: document.title || '',
        metaDescription: ($('meta[name="description"]') as HTMLMetaElement | null)?.content ?? '',
        ogTagContents,
        formCount: forms.length,
        formsWithoutRecaptcha,
        hasGlobalGrecaptchaScript,
      };
    },
    { ogTagsRequested, allowEmptyForDecorative: imgAltOpts.allowEmptyForDecorative },
  );

  // Some pages fire a client-side (JS) redirect *after* the load event
  // (e.g. abergeldie.com/admin returns 200, then JS-redirects to a login).
  // That navigation destroys the execution context mid-evaluate. Behaviour
  // is controlled by `followJsRedirect`:
  //   - false (default): report the redirect as a finding and skip DOM checks.
  //   - true: follow it — let the destination settle and snapshot that instead.
  let dom: DomSnapshot;
  try {
    dom = await captureDom();
  } catch (err) {
    if (!/execution context was destroyed|because of a navigation/i.test((err as Error).message)) throw err;
    if (!followJsRedirect) {
      note('Performed a client-side redirect after load — DOM checks skipped (set followJsRedirect: true to audit the destination).');
      reportAndMaybeThrow(mainStatus);
      return;
    }
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(1500);
    dom = await captureDom();
  }

  // ---------- 1. placeholderText (DOM-only) ----------
  if (isEnabled(checks.placeholderText)) {
    const { patterns } = asOpts(checks.placeholderText, { patterns: DEFAULT_PLACEHOLDER_PATTERNS });
    const lower = dom.bodyText.toLowerCase();
    for (const p of patterns) {
      if (lower.includes(p.toLowerCase())) {
        note(`Placeholder text "${p}" found in body copy.`);
      }
    }
  }

  // ---------- 3. canonical (DOM-only) ----------
  if (isEnabled(checks.canonical)) {
    const opts = asOpts(checks.canonical, { expectedUrl: undefined as string | undefined });
    if (!dom.canonicalHref) {
      note('Canonical tag (<link rel="canonical">) is missing.');
    } else if (opts.expectedUrl && dom.canonicalHref !== opts.expectedUrl) {
      note(`Canonical mismatch: expected "${opts.expectedUrl}", got "${dom.canonicalHref}".`);
    }
  }

  // ---------- 4. h1 count (DOM-only) ----------
  if (isEnabled(checks.h1)) {
    const { count: expected } = asOpts(checks.h1, { count: 1 });
    if (dom.h1Count !== expected) {
      note(`H1 count: expected ${expected}, found ${dom.h1Count}.`);
    }
  }

  // ---------- 5. headingOrder (DOM-only) ----------
  if (isEnabled(checks.headingOrder)) {
    let prev = 0;
    for (const lvl of dom.headingLevels) {
      if (prev !== 0 && lvl > prev + 1) {
        note(`Heading hierarchy skips a level: H${prev} followed by H${lvl}.`);
        break;
      }
      prev = lvl;
    }
  }

  // ---------- 6. imgAlt (DOM-only) ----------
  if (isEnabled(checks.imgAlt)) {
    if (dom.imgsMissingAlt.length > 0) {
      const srcs = dom.imgsMissingAlt.map((i) => i.src).join(', ');
      note(`Images missing alt attribute (showing up to 10): ${srcs}.`);
    }
  }

  // ---------- 7. metaTitle (DOM-only) ----------
  if (isEnabled(checks.metaTitle)) {
    const opts = asOpts(checks.metaTitle, {} as { minLength?: number; maxLength?: number });
    if (!dom.title.trim()) {
      note('Meta <title> is empty.');
    } else {
      if (opts.minLength !== undefined && dom.title.length < opts.minLength) {
        warn(`Meta <title> too short (${dom.title.length} < ${opts.minLength}).`);
      }
      if (opts.maxLength !== undefined && dom.title.length > opts.maxLength) {
        warn(`Meta <title> too long (${dom.title.length} > ${opts.maxLength}).`);
      }
    }
  }

  // ---------- 8. metaDescription (DOM-only) ----------
  if (isEnabled(checks.metaDescription)) {
    const opts = asOpts(checks.metaDescription, {} as { minLength?: number; maxLength?: number });
    const desc = dom.metaDescription;
    if (!desc.trim()) {
      note('Meta description is missing or empty.');
    } else {
      if (opts.minLength !== undefined && desc.length < opts.minLength) {
        warn(`Meta description too short (${desc.length} < ${opts.minLength}).`);
      }
      if (opts.maxLength !== undefined && desc.length > opts.maxLength) {
        warn(`Meta description too long (${desc.length} > ${opts.maxLength}).`);
      }
    }
  }

  // ---------- 9. ogTags (DOM-only for presence; HTTP probe for og:image) ----------
  const ogImageUrl = (() => {
    if (!checks.ogTags || checks.ogTags.length === 0) return null;
    for (const tag of checks.ogTags) {
      const content = dom.ogTagContents[tag];
      if (!content || !content.trim()) {
        note(`Open Graph tag "${tag}" is missing or empty.`);
      }
    }
    const ogImage = dom.ogTagContents['og:image'];
    return ogImage && ogImage.trim() ? new URL(ogImage, TARGET_URL).toString() : null;
  })();

  // ---------- 12. securityHeaders (from main response) ----------
  if (checks.securityHeaders && checks.securityHeaders.length > 0) {
    const lowerKeys = Object.keys(mainHeaders).map((k) => k.toLowerCase());
    for (const want of checks.securityHeaders) {
      if (!lowerKeys.includes(want.toLowerCase())) {
        note(`Response header "${want}" is missing.`);
      }
    }
  }

  // ---------- 14. expectedScripts (from request log) ----------
  if (checks.expectedScripts && checks.expectedScripts.length > 0) {
    for (const pat of checks.expectedScripts) {
      if (!requestUrls.some((u) => u.includes(pat))) {
        note(`Expected script pattern "${pat}" was not requested by the page.`);
      }
    }
  }

  // ---------- 15. recaptchaOnForms (DOM-only) ----------
  if (isEnabled(checks.recaptchaOnForms)) {
    if (dom.formsWithoutRecaptcha.length > 0) {
      note(
        `Form(s) without a recaptcha element nearby (indexes: ${dom.formsWithoutRecaptcha.join(', ')}).`,
      );
    }
  }

  // ---------- HTTP probes (run in parallel) ----------
  // Each probe is independent; bundling them halves wall-clock when
  // multiple are enabled. Probes that aren't enabled return null fast.
  type ProbeResult =
    | { kind: 'favicon'; res: Awaited<ReturnType<typeof probe>>; abs: string }
    | { kind: 'ogImage'; res: Awaited<ReturnType<typeof probe>>; abs: string }
    | { kind: 'robotsTxt'; res: Awaited<ReturnType<typeof probe>> }
    | { kind: 'sitemap'; res: Awaited<ReturnType<typeof probe>>; url: string; opts: { path?: string; spotCheckUrls?: number } }
    | { kind: 'notFoundPage'; res: Awaited<ReturnType<typeof probe>>; url: string }
    | { kind: 'lowercaseUrls'; res: Awaited<ReturnType<typeof probe>>; url: string }
    | { kind: 'trailingSlashRedirect'; res: Awaited<ReturnType<typeof probe>>; probeUrl: string; expectedTarget: string }
    | { kind: 'httpsRedirect'; res: Awaited<ReturnType<typeof probe>>; httpUrl: string };

  const probes: Promise<ProbeResult | null>[] = [];

  // favicon probe (only if we actually got a href from the DOM)
  if (isEnabled(checks.favicon)) {
    if (!dom.faviconHref) {
      note('Favicon link tag (<link rel="icon">) is missing.');
    } else {
      const abs = new URL(dom.faviconHref, TARGET_URL).toString();
      probes.push(probe(request, abs).then((res) => ({ kind: 'favicon', res, abs })));
    }
  }

  // og:image probe
  if (ogImageUrl) {
    probes.push(probe(request, ogImageUrl).then((res) => ({ kind: 'ogImage', res, abs: ogImageUrl })));
  }

  // robots.txt
  if (isEnabled(checks.robotsTxt)) {
    probes.push(probe(request, `${origin}/robots.txt`).then((res) => ({ kind: 'robotsTxt', res })));
  }

  // sitemap
  if (isEnabled(checks.sitemap)) {
    const opts = asOpts(checks.sitemap, { path: DEFAULT_SITEMAP_PATH, spotCheckUrls: 0 });
    const sitemapUrl = origin + (opts.path ?? DEFAULT_SITEMAP_PATH);
    probes.push(probe(request, sitemapUrl).then((res) => ({ kind: 'sitemap', res, url: sitemapUrl, opts })));
  }

  // 404 probe
  if (isEnabled(checks.notFoundPage)) {
    const opts = asOpts(checks.notFoundPage, { probe: DEFAULT_NOT_FOUND_PROBE });
    const probeUrl = origin + (opts.probe ?? DEFAULT_NOT_FOUND_PROBE);
    probes.push(
      probe(request, probeUrl, { maxRedirects: 0 }).then((res) => ({ kind: 'notFoundPage', res, url: probeUrl })),
    );
  }

  // lowercase URL probe
  if (isEnabled(checks.lowercaseUrls)) {
    const u = new URL(TARGET_URL);
    const m = u.pathname.match(/[a-z]/);
    if (m && m.index !== undefined) {
      const i = m.index;
      const upperPath = u.pathname.substring(0, i) + u.pathname[i].toUpperCase() + u.pathname.substring(i + 1);
      // Resolved origin (not u.origin) — see the `origin` declaration above.
      const upperUrl = `${origin}${upperPath}${u.search}`;
      probes.push(
        probe(request, upperUrl, { maxRedirects: 0 }).then((res) => ({ kind: 'lowercaseUrls', res, url: upperUrl })),
      );
    }
  }

  // trailing slash redirect probe
  if (checks.trailingSlashRedirect === 'drop' || checks.trailingSlashRedirect === 'add') {
    const mode = checks.trailingSlashRedirect;
    const u = new URL(TARGET_URL);
    const path = u.pathname;
    if (path !== '/' && path.length > 0) {
      const withSlash = path.endsWith('/') ? path : path + '/';
      const withoutSlash = path.endsWith('/') ? path.slice(0, -1) : path;
      // Resolved origin (not u.origin) — see the `origin` declaration above.
      const probeUrl =
        mode === 'drop' ? `${origin}${withSlash}${u.search}` : `${origin}${withoutSlash}${u.search}`;
      const expectedTarget =
        mode === 'drop' ? `${origin}${withoutSlash}${u.search}` : `${origin}${withSlash}${u.search}`;
      probes.push(
        probe(request, probeUrl, { maxRedirects: 0 }).then((res) => ({
          kind: 'trailingSlashRedirect',
          res,
          probeUrl,
          expectedTarget,
        })),
      );
    }
  }

  // https-redirect probe — always builds the plain-http variant of the
  // resolved host, regardless of which scheme the configured `url` uses,
  // so it validates the origin's actual HTTPS-enforcement policy rather
  // than just "did the page we already loaded happen to end up on https".
  if (isEnabled(checks.httpsRedirect)) {
    const targetPath = new URL(TARGET_URL);
    const httpUrl = `http://${new URL(origin).host}${targetPath.pathname}${targetPath.search}`;
    probes.push(
      probe(request, httpUrl, { maxRedirects: 0 }).then((res) => ({ kind: 'httpsRedirect', res, httpUrl })),
    );
  }

  const probeResults = await Promise.all(probes);

  for (const result of probeResults) {
    if (!result) continue;
    switch (result.kind) {
      case 'favicon': {
        const { res, abs } = result;
        if (!res || res.status === null || res.status < 200 || res.status >= 300) {
          note(`Favicon href "${abs}" did not return 2xx (status: ${res?.status ?? 'no response'}).`);
        }
        break;
      }
      case 'ogImage': {
        const { res, abs } = result;
        if (!res || res.status === null || res.status < 200 || res.status >= 300) {
          note(`og:image href "${abs}" did not return 2xx (status: ${res?.status ?? 'no response'}).`);
        }
        break;
      }
      case 'robotsTxt': {
        const { res } = result;
        if (!res || res.status === null || res.status < 200 || res.status >= 300) {
          note(`robots.txt did not return 2xx (status: ${res?.status ?? 'no response'}).`);
        } else {
          const body = await res.text();
          if (!/user-agent\s*:/i.test(body)) {
            note('robots.txt response did not contain a "User-agent:" directive.');
          }
        }
        break;
      }
      case 'sitemap': {
        const { res, url, opts } = result;
        if (!res || res.status === null || res.status < 200 || res.status >= 300) {
          note(`Sitemap "${url}" did not return 2xx (status: ${res?.status ?? 'no response'}).`);
        } else {
          const body = await res.text();
          if (!/<urlset|<sitemapindex/i.test(body)) {
            note(`Sitemap "${url}" did not look like XML (no <urlset> or <sitemapindex> root).`);
          } else if (opts.spotCheckUrls && opts.spotCheckUrls > 0) {
            const urls = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
            const sample = urls.sort(() => Math.random() - 0.5).slice(0, opts.spotCheckUrls);
            const spotResults = await Promise.all(sample.map((u) => probe(request, u)));
            spotResults.forEach((r, i) => {
              if (!r || r.status === null || r.status < 200 || r.status >= 300) {
                note(`Sitemap-listed URL "${sample[i]}" did not return 2xx (status: ${r?.status ?? 'no response'}).`);
              }
            });
          }
        }
        break;
      }
      case 'notFoundPage': {
        const { res, url } = result;
        if (!res) {
          note(`404 probe request to "${url}" returned no response.`);
        } else if (res.status !== 404) {
          note(`404 probe "${url}" returned status ${res.status} (expected 404).`);
        }
        break;
      }
      case 'lowercaseUrls': {
        const { res, url } = result;
        if (!res) {
          note(`Lowercase-URL probe to "${url}" returned no response.`);
        } else if (res.status === null || res.status < 300 || res.status >= 400) {
          note(`Uppercase-path variant "${url}" returned status ${res.status} (expected 301/302 to lowercase).`);
        }
        break;
      }
      case 'trailingSlashRedirect': {
        const { res, probeUrl, expectedTarget } = result;
        if (!res) {
          note(`Trailing-slash probe to "${probeUrl}" returned no response.`);
        } else if (res.status === null || res.status < 300 || res.status >= 400) {
          note(`Trailing-slash probe "${probeUrl}" returned status ${res.status} (expected 301/302 to "${expectedTarget}").`);
        } else {
          const location = res.headers['location'];
          if (location && new URL(location, probeUrl).toString() !== expectedTarget) {
            note(`Trailing-slash redirect target mismatch: "${probeUrl}" -> "${location}" (expected "${expectedTarget}").`);
          }
        }
        break;
      }
      case 'httpsRedirect': {
        const { res, httpUrl } = result;
        if (!res) {
          note(`HTTP→HTTPS probe to "${httpUrl}" returned no response.`);
        } else if (res.status === null || res.status < 300 || res.status >= 400) {
          note(`"${httpUrl}" returned status ${res.status} (expected a 301/302 redirect to HTTPS).`);
        } else {
          const location = res.headers['location'];
          const resolved = location ? new URL(location, httpUrl) : null;
          if (!resolved || resolved.protocol !== 'https:') {
            note(`"${httpUrl}" redirected to "${location ?? '<no Location header>'}" instead of an HTTPS URL.`);
          }
        }
        break;
      }
    }
  }

  // ---------- Report ----------
  // Findings fail the check; warnings (e.g. SEO length guidance) are
  // reported for visibility but don't block launch on their own.
  reportAndMaybeThrow(mainStatus);
});
