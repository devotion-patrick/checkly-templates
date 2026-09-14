# gdpr-check

PlaywrightCheck kind that monitors a URL for tracking cookies or
tracking requests fired **before user consent**. Default rule set covers
EU/EEA + UK GDPR + California (CCPA); consumers can extend or replace
the rules surgically via `overrides`, or wholesale via `preset: "none"`
plus an explicit `rules` object.

## Consumer config

```json
{
  "kind": "gdpr",
  "logicalId": "acme-home-prod-gdpr",
  "env": "PROD",
  "url": "https://www.acme.com",
  "complianceMode": "targeted",
  "preset": "eu-uk-ca",
  "overrides": {
    "trackingDomains": { "add": ["custom-tracker.example.com"] },
    "cookieBlocklist": { "add": { "vendor-x": ["_vx_*"] } }
  }
}
```

| Field            | Required | Notes                                                                          |
| ---------------- | -------- | ------------------------------------------------------------------------------ |
| `complianceMode` | yes      | `global` enforces everywhere; `targeted` enforces only from restricted regions |
| `preset`         | no       | `eu-uk-ca` (default) or `none`. `none` requires `rules`                        |
| `overrides`      | no       | Surgical add/remove on the preset's lists                                      |
| `rules`          | no       | Full custom rule set; used only when `preset: "none"`                          |

Plus the common entry fields: `logicalId`, `env`, `url`, `tags?`,
`activated?`, `frequency?`, `locations?`.

## Compliance modes

- **`global`** — fail any tracking before consent, regardless of where
  the check runs from. Strictest policy.
- **`targeted`** — only enforce when the check originates from a
  restricted region (the resolved `restrictedRegions` /
  `restrictedChecklyLocations` from preset + overrides). Runs from
  unrestricted regions still log findings, but pass.

Region detection waterfall (`gdpr-check/__checks__/gdpr.spec.ts`):
1. `CHECK_IN_RESTRICTED_REGION=true|false` env override (local dev).
2. `CHECKLY_REGION` — exposed by Checkly's Playwright Check runtime.
3. IP-based geo lookup via `ipapi.co` — slower (~300ms) fallback.
4. **Fail-safe fallback** — if all of the above fail, the script assumes
   the run is in a restricted region. Never silently let violations
   through because a geo provider is down.

## What the check actually does

For each run:

1. Patches `window.dataLayer.push` before any page script runs so it can
   observe `gtag('consent', 'default', { ... })` calls in execution order.
2. Loads the page and scrolls to the bottom (triggers lazy-loaded tags).
3. Snapshots cookies twice (synchronous Pixel cookies vs async GA
   cookies land at different points) and unions the snapshots.
4. Classifies cookies against `cookieBlocklist` and outbound requests
   against `trackingDomains`. GTM is handled separately because it can
   be compliant when paired with a consent-mode default=denied.
5. In **enforce** mode (see above), reports the run **Degraded** with a
   summary of every violation. In observe-only mode (targeted +
   unrestricted), logs everything and passes.

## Severity

Findings are ranked, worst first, because a flat list put `test_cookie`
beside a live advertising identifier and made four findings look like
four equal problems.

| Rank | What it means | Categories |
| --- | --- | --- |
| **CRITICAL** | Cross-site advertising identifier. Follows a person between sites and feeds retargeting, and the class regulators actually act on | `google_ads`, `meta`, `google_doubleclick`, `bing`, `linkedin`, `tiktok`, `pinterest`, plus ad-tech requests |
| **SERIOUS** | First-party analytics or profiling identifier. A real violation, but it profiles within one site rather than across the web, and several supervisory authorities treat first-party analytics far more leniently | `google_analytics`, `hotjar`, `hubspot`, plus analytics requests |
| **MODERATE** | Third-party embed or consent-mode weakness. The fix is a setting rather than removing a tag | `youtube`, `google_shared`, GTM without a denied default |
| **ADVISORY** | Matches a pattern but stores no identifier | `test_cookie` |

A category added through `overrides` ranks **SERIOUS**: adding one is a
deliberate act, and the safe reading of "I care about this cookie" is not
"ignore it".

### Why an online scanner may disagree

Two reasons, and both are worth knowing before treating a pass elsewhere
as the last word.

Most scanners stop once they see Consent Mode `default=denied` recorded
before the tags load. This check goes further and asks whether the
cookies actually stayed unset — a site can record the default correctly
and still write `_ga`, which is a violation that a consent-mode check
alone will not see.

Scanners also test from wherever they run, and a site that gates consent
by region behaves differently depending on where it is asked from. This
check resolves its own region (see `restrictedRegions`), so in
**targeted** mode an unrestricted run is observe-only and passes, while a
restricted one enforces.

A violation reports **Degraded**, not Down. Cookies set before consent is
a real compliance problem, but it is not the site being down: it wants
somebody to schedule a fix, not to wake somebody at three in the morning.
Reported as a failure it competed for attention with genuine outages,
which is how a report stops being read.

Mechanically this is the `degraded.json` convention — a file left in the
working directory marks the run Degraded rather than Up, as long as
nothing else failed. The same mechanism `launch-readiness` uses. The
console lines are written either way, because they are what names the
offending cookie or domain.

## Env-var contract (factory -> spec)

| Var                  | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `CHECK_TARGET_URL`   | Absolute URL to test                                                   |
| `CHECK_KIND`         | Must equal `"gdpr"` for this spec to enforce                           |
| `CHECK_PARAMS`       | JSON: complianceMode + resolved rules from preset + overrides          |
| `CHECK_IN_RESTRICTED_REGION` | Optional dev override (`true` / `false`)                       |

The rule set is fully resolved at deploy time by `factory.ts`, so the
spec is data-driven and the algorithm has no inline blocklist to drift
out of sync with the preset.
