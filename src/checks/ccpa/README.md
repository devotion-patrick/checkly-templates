# ccpa

PlaywrightCheck kind that tests California opt-out compliance (CCPA as
amended by CPRA): that the site honours Global Privacy Control, shows an
opt-out link, and stops selling or sharing data after an opt-out.

It's separate from [`gdpr`](../gdpr/README.md) because the two laws ask
opposite questions. GDPR is opt-in: nothing before consent. CCPA is
opt-out: tracking before any interaction is allowed, as long as the
visitor can opt out and the site honours it. Running the gdpr check from
California fails things CCPA allows.

## Consumer config

```json
{
  "kind": "ccpa",
  "logicalId": "acme-home-prod-ccpa",
  "url": "https://www.acme.com",
  "locations": ["us-west-1"],
  "checkLevel": "standard",
  "overrides": {
    "adTechDomains": { "add": ["ads.example.net"] },
    "optOutLinkPatterns": { "add": ["california privacy rights"] },
    "optOutSelectors": ["#ot-sdk-btn"]
  },
  "smoke": true,
  "monitor": true
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `locations` | yes | California only (`us-west-1`). Project default locations are not used |
| `checkLevel` | no | `report`, `standard` or `strict`. Overrides `CCPA_CHECK_LEVEL` for this site |
| `overrides` | no | Add or remove ad-tech domains, analytics domains, ad cookie categories, opt-out link patterns; extra opt-out link selectors |

Plus the common entry fields: `logicalId`, `env`, `url`, `tags?`,
`activated?`, `frequency?` (default `EVERY_24H`).

### Why locations are required and California only

Sites gate their CCPA behaviour on the visitor's IP: the opt-out link and
GPC handling often only appear for California. Run from anywhere else and
the check tests the wrong behaviour. A project default (often EU or APAC)
would do that silently, so this kind ignores project defaults and the
schema and factory both reject non-California locations.

Each location becomes its own check (`<logicalId>-<location>`) with
`CHECK_LOCATION` set, as the gdpr kind does. No IP lookup is needed.

## What the check does

Two passes, each in a fresh browser context:

1. **Baseline.** Load, scroll, wait for the network, snapshot cookies.
   Record ad-tech and analytics requests, look for the opt-out link, read
   the GPP and US Privacy strings if the page's CMP exposes them.
2. **GPC on.** Same load with the `Sec-GPC: 1` header and
   `navigator.globalPrivacyControl = true`. Record ad-tech requests, their
   restricted-processing flags, ad cookies, and whether the CMP recorded
   the opt-out.

### Opt-out link

Found when an `a`, `button` or role link/button has text, `aria-label` or
`title` containing a pattern from the preset (case-insensitive):
`do not sell`, `do not share`, `privacy choices`, `opt out of sale` and
similar. That covers "Do Not Sell or Share My Personal Information" and
the "Your Privacy Choices" alternative link. Add `optOutSelectors` for
a CMP button the text misses.

### Restricted-processing flags

An ad-tech hit after an opt-out isn't automatically a sale if it tells
the vendor to restrict processing. Recognised on hits (not script loads):

| Vendor | Flag |
| --- | --- |
| Meta | `dpo=LDU` (Limited Data Use) |
| Google Ads / Floodlight | `rdp=1`, `npa=1`, or `gcs` / `gcd` with ad storage, ad user data or ad personalisation denied |

Vendors without a known flag count as unflagged.

## Check levels

| Level | Behaviour |
| --- | --- |
| `report` | Logs and grades every finding. Never fails |
| `standard` (default) | Accepts vendor restricted-processing flags as WARN |
| `strict` | Fails flagged hits too, as they still disclose IP and device data |

Set per environment with `CCPA_CHECK_LEVEL`, or per site with
`checkLevel`, which wins. An unknown value stops the run.

## Grading

| Finding | standard | strict | Rule |
| --- | --- | --- | --- |
| Ad-tech hit after GPC, no restricted-processing flag | FAIL | FAIL | `sale-after-gpc` |
| Ad cookie set after GPC | FAIL | FAIL | `ad-cookie-after-gpc` |
| Ad-tech seen before opt-out, no opt-out link | FAIL | FAIL | `no-opt-out-link` |
| Ad-tech hits after GPC, all flagged | WARN | FAIL | `restricted-processing-after-gpc` |
| Ad-tech script loaded after GPC, no hits | WARN | FAIL | `ad-script-after-gpc` |
| CMP privacy string shows no opt-out after GPC | WARN | WARN | `gpp-opt-out-missing` |
| Analytics after GPC | INFO | WARN | `analytics-after-gpc` |
| Opt-out link found | INFO | INFO | `opt-out-link` |
| No opt-out link, no ad-tech seen | INFO | INFO | `no-opt-out-link-no-sale-seen` |
| Ad-tech or analytics before opt-out | INFO | INFO | `tracking-before-opt-out` |
| CMP privacy string records the opt-out | INFO | INFO | `gpp-opt-out-recorded` |
| Privacy string present but not decoded | INFO | INFO | `privacy-string-unparsed` |

Why these grades:

- Tracking before an opt-out is allowed under CCPA, so baseline findings
  are INFO.
- Honouring GPC is where enforcement is happening (AG and CPPA actions
  against Healthline, Tractor Supply, PlayOn Sports and Disney, 2025 to
  2026), so an unflagged ad-tech hit or ad cookie after GPC fails.
- Restricted-processing flags are the vendors' own CCPA mechanism.
  Standard accepts them; strict follows the reading that the hit itself
  still discloses IP and device data.
- First-party analytics under a service-provider contract isn't a sale or
  share. The check can't see the contract, so strict warns.
- No ad-tech before opt-out suggests nothing is sold or shared, so a
  missing link is INFO.
- The GPP / US Privacy check reports what the CMP recorded. Showing
  whether the signal was honoured (11 CCR §7025(c)(6)) is CMP-specific,
  so the on-page message isn't asserted.

## Outcome

| Findings | Result | Checkly |
| --- | --- | --- |
| Any FAIL | `failed` | Failed |
| WARN, no FAIL | `passed with warnings` | Degraded (via `degraded.json`) |
| INFO only, or none | `passed` | Passed |

Findings are `{ severity, rule, detail, url }`; the run asserts once with
`expect(failures).toEqual([])`, skipped in `report`.

## Not covered yet

- Manual opt-out (clicking the link and toggling the CMP). Needs
  per-CMP selectors.
- Decoding raw GPP strings. Only the CMP's `parsedSections` and the US
  Privacy string are read.
- Other US states with opt-out signal duties (e.g. Colorado, Connecticut,
  Texas, Oregon; Louisiana from 2027, Vermont from 2028).

## Env-var contract (factory -> spec)

| Var | Purpose |
| --- | --- |
| `CHECK_TARGET_URL` | Absolute URL to test |
| `CHECK_KIND` | Must equal `"ccpa"` for this spec to run |
| `CHECK_PARAMS` | JSON: checkLevel (if set) + resolved rules from preset + overrides |
| `CHECK_LOCATION` | Checkly location this check runs from. Set by the factory |
| `CCPA_CHECK_LEVEL` | `report`, `standard` (default) or `strict`. A site's `checkLevel` wins |
