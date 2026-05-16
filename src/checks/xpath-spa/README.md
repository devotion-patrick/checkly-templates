# xpath-check-spa

PlaywrightCheck kind that loads a JS-rendered page in Chromium and
asserts DOM-level expectations. Use this when the markup you care
about isn't present in the server response (SPAs, hydration, client
side rendering).

For server-rendered pages, prefer [`xpath-check`](../xpath-check) —
it's faster and doesn't need a browser.

## Consumer config

```json
{
  "kind": "xpath-spa",
  "logicalId": "acme-spa-prod-headline",
  "env": "PROD",
  "url": "https://app.acme.com",
  "waitUntil": "domcontentloaded",
  "expect": [
    { "selector": "h1", "equals": "Welcome to Acme" },
    { "selector": "meta[name=\"description\"]", "attribute": "content", "contains": "Acme delivers" },
    { "selector": ".error-banner", "count": 0 }
  ]
}
```

| Field        | Required | Notes                                                            |
| ------------ | -------- | ---------------------------------------------------------------- |
| `expect[]`   | yes      | Selector + assertion combo. Multiple allowed.                    |
| `waitUntil`  | no       | `load` / `domcontentloaded` (default) / `networkidle`            |

### Per-selector fields

| Field         | Notes                                                                |
| ------------- | -------------------------------------------------------------------- |
| `selector`    | Any Playwright locator string (CSS / `text=...` / `xpath=...`)        |
| `equals`      | textContent (or attribute, if `attribute` set) must equal this        |
| `contains`    | textContent (or attribute) must contain this                          |
| `notContains` | textContent (or attribute) must not contain this                      |
| `attribute`   | When set, the assertion is on the named attribute, not textContent    |
| `count`       | Asserts the locator matches exactly this many elements                |

At least one of `equals` / `contains` / `notContains` / `count` is
required per selector.

Default schedule: `EVERY_1H` from `eu-central-1`. Like all PlaywrightCheck
kinds, this triggers Chromium installation in CI pipelines (handled
automatically by the deploy templates).
