# custom-multistep

MultiStepCheck kind for request-only validation whose logic doesn't fit
any other kind — the entire check is a user-authored script, several
sequential HTTP requests with logic between them, and nothing else.
This is the request-only sibling of [custom-playwright](../custom-playwright/README.md):
**the script owns 100% of what the check does and asserts**, the same
way, but a Multistep check never spins up a browser at all.

## Why this kind exists, and not custom-playwright

Checkly's [Multistep checks](https://www.checklyhq.com/docs/multistep-checks)
are "powered by Playwright's API testing mode" — `request`
(Playwright's `APIRequestContext`) is available, `page` is not, and no
browser is ever instantiated. That matters for two reasons:

- **It is the honest shape for validation that never touches a DOM.** A
  dealer/franchise directory endpoint whose response names dozens of
  independent sites, each also checked for a status code and a response
  body substring, needs many outbound requests and zero rendering.
  Reaching for `custom-playwright` for that works — a `BrowserCheck` can
  make plain HTTP requests via `page.request` too — but it pays for a
  browser it never uses.
- **It is not about the time budget.** Both kinds share Checkly's 240-second
  limit; a `custom-api` teardown script's 10-second limit is the actual
  reason either of these exists over that kind. Choosing between
  `custom-multistep` and `custom-playwright` is purely "does this
  validation ever need a real page" — reach for `custom-playwright`
  instead the moment it does.

## Consumer config

```json
{
  "kind": "custom-multistep",
  "logicalId": "luxaflex-dealer-list-sites",
  "url": "https://cms.dealer-sites.luxaflex.com.au",
  "path": "/CMSPages/Devotion/HealthCheck/DealerList.ashx",
  "script": "const { test, expect } = require('@playwright/test'); test('dealer sites are healthy', async ({ request }) => { /* ... */ });",
  "monitor": true
}
```

| Field    | Required | Notes |
| -------- | -------- | ----- |
| `path`   | no       | Appended to `url` before this check runs. Portal-only plumbing — see below |
| `script` | **yes**  | The full Multistep check script — see below |

## `path` is portal-only plumbing

Identical field, identical reasoning to [custom-api's `path`](../custom-api/README.md#path-is-portal-only-plumbing)
and [custom-playwright's](../custom-playwright/README.md). `url` above
is already the full absolute address; a consumer of this schema that
already sets it directly (this repo's own deploy pipeline included) has
no use for `path` and can leave it unset.

## The `script` contract

The script is Checkly's own [MultiStepCheck](https://www.checklyhq.com/docs/multistep-checks)
`code.content` verbatim, written the same way a hand-authored one would
be in Checkly's own editor or CLI:

```js
const { test, expect } = require('@playwright/test');

test('dealer sites are healthy', async ({ request }) => {
  const dealerListResponse = await request.get(process.env.CHECK_TARGET_URL);

  expect(dealerListResponse.status()).toBe(200);

  // ... fetch and assert on whatever the response names, using
  // `request` for further HTTP calls -- there is no `page` fixture here.
});
```

**`process.env.CHECK_TARGET_URL`** is the one thing set for you: this
entry's own resolved `url` (already combined with `path`, if set), so
the script is not forced to hardcode the address it was defined
against. Everything else — assertions, additional requests, timeouts —
is the script's own to decide.

**If you're building a UI that lets someone author this script**: the
one thing worth hinting is the missing `page` fixture — someone reaching
for `page.goto()` here needs `custom-playwright` instead, not this kind.

## When to reach for a different kind instead

If the check needs a real page — DOM assertions, JS-rendered content,
multi-step navigation — that's [custom-playwright](../custom-playwright/README.md),
not this kind: a `MultiStepCheck` has no `page` fixture at all. If the
check fits inside an API check's 10-second teardown budget and needs
only one request's own response to validate, [custom-api](../custom-api/README.md)
is the lighter-weight kind for the same "the script is the entire
validation" shape.

Default schedule: `EVERY_1H` — a fully consumer-authored script has no
bound on how much work or how many outbound requests one run makes,
the same reasoning `custom-playwright`'s default carries.
