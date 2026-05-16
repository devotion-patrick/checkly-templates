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
5. In **enforce** mode (see above), fails the check with a summary of
   every violation. In observe-only mode (targeted + unrestricted), logs
   everything and passes.

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
