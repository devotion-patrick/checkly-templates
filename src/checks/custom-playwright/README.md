# custom-playwright

BrowserCheck kind for browser-driven validation whose logic doesn't fit
any other kind — the entire check is a user-authored Playwright script.
This is the browser-check counterpart to [custom-api](../custom-api/README.md):
**the script owns 100% of what the check does and asserts** — there is
no request/response envelope, no assertions field, nothing this kind
adds on top of a plain Checkly BrowserCheck.

## Why this kind exists

`custom-api`'s teardown script runs against Checkly's API-check limits:
10 seconds for the setup/teardown script, 30 seconds for the whole check.
That is not enough for validation that has to make many outbound
requests of its own — e.g. a dealer/franchise directory endpoint
whose response names dozens of independent sites, each of which also
needs checking. A Checkly BrowserCheck's own limit is 240 seconds, 24
times the budget, for exactly the same reason a real browser session
needs more room than a single HTTP round trip. Reach for this kind when
the volume or shape of what needs validating does not fit in ten
seconds, not because the validation itself needs a real browser.

## Consumer config

```json
{
  "kind": "custom-playwright",
  "logicalId": "luxaflex-dealer-list-sites",
  "url": "https://cms.dealer-sites.luxaflex.com.au",
  "path": "/CMSPages/Devotion/HealthCheck/DealerList.ashx",
  "script": "const { test, expect } = require('@playwright/test'); test('dealer sites are healthy', async ({ page }) => { /* ... */ });",
  "monitor": true
}
```

| Field    | Required | Notes |
| -------- | -------- | ----- |
| `path`   | no       | Appended to `url` before this check runs. Portal-only plumbing — see below |
| `script` | **yes**  | The full Playwright test script — see below |

## `path` is portal-only plumbing

Identical field, identical reasoning to [custom-api's `path`](../custom-api/README.md#path-is-portal-only-plumbing).
`url` above is already the full absolute address; a consumer of this
schema that already sets it directly (this repo's own deploy pipeline
included) has no use for `path` and can leave it unset.

## The `script` contract

The script is Checkly's own [BrowserCheck](https://www.checklyhq.com/docs/constructs/browser-check/)
`code.content` verbatim — a Node.js script using Playwright (or
Puppeteer), exactly as if it had been written directly in Checkly's own
editor or CLI. Nothing about this kind's schema constrains its shape
beyond requiring it be present and non-empty:

```js
const { test, expect } = require('@playwright/test');

test('dealer list sites are healthy', async ({ page }) => {
  const dealerListResponse = await page.request.get(process.env.CHECK_TARGET_URL);

  expect(dealerListResponse.status()).toBe(200);

  // ... fetch and assert on whatever the response names, using
  // page.request for plain HTTP calls without a full page load.
});
```

**`process.env.CHECK_TARGET_URL`** is the one thing set for you: this
entry's own resolved `url` (already combined with `path`, if set), so
the script is not forced to hardcode the address it was defined
against. Everything else — assertions, additional requests, timeouts —
is the script's own to decide.

**If you're building a UI that lets someone author this script**: there
is no separate contract to validate or hint against beyond "this is a
Node.js script Checkly runs as a BrowserCheck" — unlike `custom-api`,
there is no fixed `response`/`request` scope, because there is no
declarative request this kind sends on the consumer's behalf. The
script itself decides what, if anything, it requests.

## When to reach for a different kind instead

If the check is really "load one page and assert on selectors, cookies
or hygiene tags", [xpath-spa](../xpath-spa/README.md), [gdpr](../gdpr/README.md)
and [launch-readiness](../launch-readiness/README.md) already do that
with a fixed, tested spec — no need to hand-write that logic here. If
the check fits inside an API check's 10-second teardown budget and
needs no real browser, [custom-api](../custom-api/README.md) is the
lighter-weight kind for the same "the script is the entire validation"
shape.

Default schedule: `EVERY_1H` — a browser check bills per run in every
region it uses, and unlike `custom-api`'s teardown script, a fully
consumer-authored Playwright script has no bound on how much work one
run can do.
