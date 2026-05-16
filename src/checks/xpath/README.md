# xpath-check

ApiCheck kind that GETs a URL and asserts the **raw response body**
contains, does not contain, or matches expected strings or regex
patterns. No browser, no JS execution — fast, cheap, suitable for
server-rendered pages where the markup is meaningful as-is.

For JS-rendered (SPA) pages, use [`xpath-check-spa`](../xpath-check-spa)
instead.

## Naming

The name is historical: an earlier internal version of this kind ran
real XPath against rendered DOM. This API-only variant predates the
rename of the SPA variant. We kept the name for continuity.

## Consumer config

```json
{
  "kind": "xpath",
  "logicalId": "acme-marketing-prod-meta",
  "env": "PROD",
  "url": "https://www.acme.com",
  "expect": {
    "contains": ["<title>Acme - Home</title>"],
    "notContains": ["lorem ipsum"]
  }
}
```

| Field                | Required | Notes                                          |
| -------------------- | -------- | ---------------------------------------------- |
| `expect`             | yes      | At least one of `contains` / `notContains`     |
| `expect.contains`    | no       | Each substring must appear in the body         |
| `expect.notContains` | no       | None of these substrings may appear            |

Regex matching is intentionally out of scope: Checkly's ApiCheck
`textBody` matcher only supports substring assertions. If you need
regex, use [`xpath-check-spa`](../xpath-check-spa) — it runs in
Playwright and can call `expect(text).toMatch(/.../)` against
rendered DOM.

Default schedule: `EVERY_30M` from `eu-central-1`.
