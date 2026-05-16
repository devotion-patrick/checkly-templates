# launch-readiness

PlaywrightCheck kind that runs the structural slice of a launch-audit
checklist against a URL — placeholder copy, SEO metadata, OG tags,
robots/sitemap, security headers, 404-page implementation, redirect
hygiene, expected third-party scripts, reCAPTCHA-on-forms, and more.

Each check is opt-in. The spec loads the page once, runs every enabled
assertion, accumulates findings, and reports a single pass/fail with a
list. First-fail short-circuiting would make multi-issue audits a pain
to triage; this gives you the whole punch list in one go.

## Consumer config

```json
{
  "kind": "launch-readiness",
  "logicalId": "acme-home-launch-ready",
  "env": "PROD",
  "url": "https://www.acme.com",
  "checks": {
    "placeholderText": true,
    "favicon": true,
    "canonical": { "expectedUrl": "https://www.acme.com/" },
    "h1": true,
    "headingOrder": true,
    "imgAlt": true,
    "metaTitle": { "minLength": 30, "maxLength": 65 },
    "metaDescription": { "minLength": 70, "maxLength": 160 },
    "ogTags": ["og:title", "og:description", "og:image", "og:url"],
    "robotsTxt": true,
    "sitemap": { "spotCheckUrls": 3 },
    "securityHeaders": [
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Strict-Transport-Security",
      "Referrer-Policy",
      "Content-Security-Policy"
    ],
    "notFoundPage": true,
    "expectedScripts": ["googletagmanager.com/gtm.js"],
    "recaptchaOnForms": true,
    "lowercaseUrls": true,
    "trailingSlashRedirect": "drop"
  },
  "smoke": true,
  "monitor": false
}
```

Every key under `checks` is optional. Omit a key (or set it to `false`)
to skip that assertion. Boolean `true` enables the default behaviour;
an options object enables with overrides.

## Per-check field reference

| Key | Type | What it asserts |
|---|---|---|
| `placeholderText` | `boolean` \| `{ patterns: string[] }` | Body text contains none of the listed substrings (case-insensitive). Defaults: `["lorem ipsum", "TODO:", "TBD", "Placeholder", "FPO"]`. |
| `favicon` | `boolean` | `<link rel="icon">` exists and its href returns 2xx. |
| `canonical` | `boolean` \| `{ expectedUrl?: string }` | `<link rel="canonical">` exists. With `expectedUrl`, the value must match. |
| `h1` | `boolean` \| `{ count: number }` | Document has exactly `count` H1 elements (default 1). |
| `headingOrder` | `boolean` | Heading hierarchy does not skip levels (H1 → H3 fails). |
| `imgAlt` | `boolean` \| `{ allowEmptyForDecorative: boolean }` | Every `<img>` has an `alt` attribute. `allowEmptyForDecorative` (default true) lets decorative images use `alt=""` or `role="presentation"`. |
| `metaTitle` | `boolean` \| `{ minLength?: number; maxLength?: number }` | `<title>` is non-empty. Optional length bounds for SEO compliance. |
| `metaDescription` | `boolean` \| `{ minLength?: number; maxLength?: number }` | `<meta name="description">` is non-empty. Optional length bounds. |
| `ogTags` | `string[]` | Each listed `og:*` property exists with non-empty content. `og:image`'s URL is also fetched and verified to return 2xx. |
| `robotsTxt` | `boolean` | `<origin>/robots.txt` returns 2xx and contains a `User-agent:` directive. |
| `sitemap` | `boolean` \| `{ path?: string; spotCheckUrls?: number }` | `<origin>/sitemap.xml` (or custom `path`) returns 2xx and is valid XML. `spotCheckUrls` randomly samples N listed URLs and verifies each returns 2xx. |
| `securityHeaders` | `string[]` | Each listed response header is present on the main page response (case-insensitive). |
| `notFoundPage` | `boolean` \| `{ probe?: string }` | A non-existent path returns 404 (probe defaults to a random nonsense path). |
| `expectedScripts` | `string[]` | Each substring matches at least one network request URL the page made (GTM/GA/Hotjar/etc. presence). |
| `recaptchaOnForms` | `boolean` | Every `<form>` has a `.g-recaptcha` / `[data-sitekey]` element OR the document has a global grecaptcha script tag. |
| `lowercaseUrls` | `boolean` | Replacing the first lowercase letter of the URL path with uppercase produces a 3xx redirect. Skipped if path is empty or has no lowercase letters. |
| `trailingSlashRedirect` | `"drop"` \| `"add"` | `"drop"`: trailing-slash variant must redirect to no-slash. `"add"`: no-slash must redirect to trailing-slash. Skipped on the root path. |

## What this kind doesn't cover

The launch-audit items below are out of scope and live in other tools / processes:

- **Process/workflow**: content authoring & approval, client approvals, DNS-cutover meetings
- **External scanners**: Semrush, Screaming Frog, full Lighthouse / PageSpeed (we can capture Web Vitals via a separate kind if useful)
- **Security depth**: penetration testing, 3rd-party audits, load testing
- **Other monitoring tooling**: NewRelic / Pingdom / Datadog browser monitoring — Checkly is one tool in the stack, not all of them
- **Form submission end-to-end**: this kind verifies reCAPTCHA presence on forms; actually filling and submitting a form is per-form-specific work for `xpath-spa`

## Default schedule

`EVERY_24H`. Most launch-readiness items don't need 5-minute observation — they're things you fix once at launch and want to know about within a day if they regress (e.g. someone disables HSTS while debugging). Override per-entry via `frequency` if you want tighter cadence on a specific check.

Pair `smoke: true` with this kind for the release-gate use case (run once per deploy). Pair `monitor: true` if you also want drift detection.
