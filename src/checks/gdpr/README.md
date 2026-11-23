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
  "checkLevel": "standard",
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
| `checkLevel`     | no       | `report`, `standard` or `strict`. Overrides `GDPR_CHECK_LEVEL` for this site    |
| `preset`         | no       | `eu-uk-ca` (default) or `none`. `none` requires `rules`                        |
| `overrides`      | no       | Surgical add/remove on the preset's lists                                      |
| `rules`          | no       | Full custom rule set; used only when `preset: "none"`                          |

Plus the common entry fields: `logicalId`, `env`, `url`, `tags?`,
`activated?`, `frequency?`, `locations?`.

## Compliance modes

- **`global`** — enforce the [check level](#check-levels) regardless of
  where the check runs from.
- **`targeted`** — only enforce when the check originates from a
  restricted region (the resolved `restrictedRegions` /
  `restrictedChecklyLocations` from preset + overrides). Runs from
  unrestricted regions still grade and log findings, but pass.

Compliance mode decides *where* to enforce; check level decides *what*
fails.

### One check per location

Each entry becomes one Checkly check per location, with logicalId
`<logicalId>-<location>` and the location appended to the name. Each check
carries `CHECK_LOCATION`, so it knows where it ran without asking an IP
service. Checkly's Playwright checks don't expose the run location
themselves, and a single check run in parallel shares one env across
locations.

The suffix is applied even for one location, so adding a location later
doesn't rename the existing check.

A location in `restrictedChecklyLocations` is restricted; any other is
not. The default list covers the EU, London and `us-west-1`
(N. California). To drop California, remove both `US-CA` from
`restrictedRegions` and `us-west-1` from `restrictedChecklyLocations`.

### Region detection

Waterfall (`gdpr/__checks__/grading.ts`), run once per Playwright worker:
1. `CHECK_IN_RESTRICTED_REGION=true|false` env override (local dev).
2. `CHECK_LOCATION`, set per check by the factory. Covers every deployed check.
3. `GDPR_REGION`, an ISO code such as `DE` or `US-CA`, for local runs.
4. `CHECKLY_REGION`, if a Checkly runtime ever exposes it.
5. IP lookup via `ipapi.co`. Local runs only in practice. Its free tier
   rate-limits shared IPs (429); `GDPR_GEOIP_API_KEY` takes a paid key.
6. **Fail-safe fallback.** If all of the above fail, the run is treated as
   restricted and the output says why.

## What the check actually does

For each run:

1. Patches `window.dataLayer.push` before any page script runs so it can
   observe `gtag('consent', 'default', { ... })` calls in execution order.
2. Loads the page and scrolls to the bottom (triggers lazy-loaded tags).
3. Snapshots cookies twice (synchronous Pixel cookies vs async GA
   cookies land at different points) and unions the snapshots.
4. Classifies cookies against `cookieBlocklist` and outbound requests
   against `trackingDomains` (an entry matches its own host and any
   subdomain, so `bat.bing.com` catches `bat.bing.com` but not
   `www.bing.com`). Google requests are read for their Consent
   Mode state (`gcs`, then `gcd`). GTM is handled separately because it
   can be compliant when paired with a consent-mode default=denied.
5. Grades every finding INFO, WARN or FAIL for the check level, prints
   them, then asserts once that no finding is FAIL. See
   [Check levels](#check-levels).

## Check levels

Whether a site passes depends on how strictly the client reads the law,
which is a client or legal decision. So the check takes a level rather
than hard-coding one answer.

| Level | Behaviour |
| --- | --- |
| `report` | Logs and grades every finding. Never fails |
| `standard` (default) | Accepts Google Consent Mode v2 "advanced": denied-state cookieless pings are WARN |
| `strict` | Any tracking request before consent fails, as only Consent Mode "basic" passes |

Set it per environment with `GDPR_CHECK_LEVEL`, or per site with the
entry's `checkLevel`, which wins. An unknown value stops the run rather
than quietly falling back.

### Why two levels

In Consent Mode advanced, GTM sets consent to denied by default and GA
then sends cookieless pings before the visitor chooses. No cookies are
set, and Google designs it to work this way. Under a strict EU reading
it is still a risk: EDPB Guidelines 2/2023 on the technical scope of
ePrivacy Art 5(3) treat pixels and pings that send device data (IP, user
agent) as in scope even without cookies, and some DPAs (CNIL, Dutch AP)
take that line. Standard accepts the Google design, strict follows the
EDPB reading.

### Grading

| Finding before consent | standard | strict | Rule |
| --- | --- | --- | --- |
| Non-essential cookie set | FAIL | FAIL | `cookie-before-consent` |
| Google request, consent denied, no Google cookies | WARN | FAIL | `google-request-denied-cookieless` |
| Google request, consent denied, Google cookies set anyway | FAIL | FAIL | `google-request-denied-with-cookies` |
| Google request, consent granted | FAIL | FAIL | `google-request-consent-granted` |
| Google request, no consent signal | FAIL | FAIL | `google-request-no-consent-signal` |
| Non-Google tracking request | FAIL | FAIL | `tracking-request-before-consent` |
| GTM loaded, consent default denied set first | INFO | INFO | `gtm-consent-default-first` |
| GTM loaded, no consent default before tags fire | FAIL | FAIL | `gtm-no-consent-default` |
| `test_cookie` probe | INFO | INFO | `probe-cookie-before-consent` |

Consent state on a Google request comes from `gcs` (`G1<ad_storage><analytics_storage>`,
so `G100` is both denied and `G101` is analytics granted), then `gcd` if
`gcs` is missing. Neither means no consent signal. Any storage granted
counts as granted. Google requests are those to `google-analytics.com`,
`doubleclick.net`, `googlesyndication.com`, `googleadservices.com` and
`google.com`, when they are in `trackingDomains`.

`test_cookie` is DoubleClick checking whether cookies work. It holds no
identifier, and the doubleclick.net request that sets it is graded on its
own, so it is INFO rather than a second FAIL for the same tag.

Cookie findings keep the 1.3.0 rank in their detail (critical for
advertising identifiers, serious for analytics, moderate for embeds),
and are listed worst first.

### Outcome

| Findings | Result | Checkly |
| --- | --- | --- |
| Any FAIL | `failed` | Failed |
| WARN, no FAIL | `passed with warnings` | Degraded (via `degraded.json`) |
| INFO only, or none | `passed` | Passed |

Every finding is collected as `{ severity, rule, detail, url }` and the
run asserts once at the end with `expect(failures).toEqual([])`. In
`report`, and in targeted mode from an unrestricted region, the assertion
is skipped and the output says what the result would have been.

The output leads with the level and where it came from, the region and how
it was detected, then each finding with its grade:

```
  check level:           standard (default)
  region:                eu-west-1 via CHECK_LOCATION, restricted
  enforcing:             yes
  findings (2):
    [WARN] google-request-denied-cookieless: google-analytics.com, gcs=G100: Consent Mode advanced cookieless ping. ...
    [INFO] gtm-consent-default-first: GTM loaded, Consent Mode default=denied set before tags fired
  result: passed with warnings (0 FAIL, 1 WARN)
```

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

## Env-var contract (factory -> spec)

| Var                  | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `CHECK_TARGET_URL`   | Absolute URL to test                                                   |
| `CHECK_KIND`         | Must equal `"gdpr"` for this spec to enforce                           |
| `CHECK_PARAMS`       | JSON: complianceMode, checkLevel (if set) + resolved rules             |
| `CHECK_LOCATION`     | Checkly location this check runs from. Set by the factory              |
| `CHECK_IN_RESTRICTED_REGION` | Optional dev override (`true` / `false`)                       |
| `GDPR_CHECK_LEVEL`   | `report`, `standard` (default) or `strict`. A site's `checkLevel` wins |
| `GDPR_REGION`        | ISO region code. Skips the GeoIP lookup                                |
| `GDPR_GEOIP_API_KEY` | ipapi.co API key. Store as a secret                                    |

The rule set is fully resolved at deploy time by `factory.ts`, so the
spec is data-driven and the algorithm has no inline blocklist to drift
out of sync with the preset.
