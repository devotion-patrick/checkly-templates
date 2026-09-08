# custom-api

ApiCheck kind for a check whose validation logic doesn't fit any other
kind — the entire check is a user-authored script, e.g. one set in an
external UI's script editor before publishing. The request itself
(`url`/`method`/`headers`/`body`) is declarative like every other
ApiCheck kind; **the script owns 100% of the pass/fail decision** — there
is no separate `assertions` field.

## Consumer config

```json
{
  "kind": "custom-api",
  "logicalId": "acme-orders-smoke",
  "url": "https://api.acme.com/orders",
  "method": "POST",
  "body": "{\"customerId\": \"demo\"}",
  "headers": [{ "key": "Content-Type", "value": "application/json" }],
  "script": "const body = JSON.parse(response.body); if (response.statusCode !== 201) throw new Error('expected 201, got ' + response.statusCode); if (!body.orderId) throw new Error('missing orderId in response');",
  "smoke": true
}
```

| Field       | Required | Notes |
| ----------- | -------- | ----- |
| `path`      | no       | Appended to `url` before the request is built. Portal-only plumbing — see below |
| `method`    | no       | Default `GET`. One of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` |
| `body`      | no       | Request body (e.g. a JSON string) |
| `headers`   | no       | Same shape as [dotnet-health](../dotnet-health/README.md#authenticating-to-the-health-endpoint)'s: each item sets exactly one of `value` (literal) or `valueFromEnv` (CI-sourced, per-check secret) |
| `script`    | one of   | The full validation script — see below. Exactly one of `script` / `snippetId` is required |
| `snippetId` | one of   | A Checkly account-level Snippet's id, run in place of `script` — see below. Exactly one of `script` / `snippetId` is required |

## `path` is portal-only plumbing

`url` above is already the full absolute address — this schema does not
distinguish "the host" from "the endpoint under it" the way a consumer
built around hostnames might. A consumer of this schema that already
sets `url` directly (this repo's own deploy pipeline included) has no
use for `path` at all and can leave it unset.

It exists because the Devotion portal's own configuration derives `url`
from an application's hostname rather than letting an operator type one
freely, and a hostname is a domain (`https://cms.example.com`), not a
specific endpoint (`https://cms.example.com/CMSPages/Devotion/HealthCheck/DealerList.ashx`).
The portal appends `path` to that hostname's address before validating,
so the derived `url` is always what actually reaches the schema and
`factory.ts` — this field is inert here, present only so a
portal-authored configuration round-trips through validation unchanged.

## `script` vs `snippetId`

Exactly one of the two is required — this kind's entire validation has
to come from somewhere, and from exactly one place.

**`snippetId` is REST-API-only.** Checkly account-level Snippets
(created and named in Checkly's UI, referenced elsewhere by
`require('./snippets/name.js')`) can be attached to a check by id
(`tearDownSnippetId` on the raw `POST /v1/checks` body) when a consumer
creates checks by calling Checkly's REST API directly — e.g. the
Devotion portal. Checkly's own docs are explicit that account Snippets
are **not supported for a CLI/constructs-managed check**: `checkly
deploy` bundles local files under `./snippets` at build time instead, so
there is no equivalent for this repo's own pipeline. Set `snippetId` in
a config validated by this repo's schema and `factory.ts` throws rather
than silently ignoring it — use `script` here.

## The `script` contract

The script runs as this check's
[`tearDownScript`](https://www.checklyhq.com/docs/detect/synthetic-monitoring/api-checks/setup-and-teardown/) —
i.e. **after** the request completes, with these in scope:

- **`response`** — `{ statusCode, body, headers, timings }`. `body` is
  the raw string; `JSON.parse(response.body)` if you expect JSON.
- **`request`** — the request that was sent (read-only here).
- **`process.env`** — includes any per-check env vars from `valueFromEnv`
  headers, plus anything else on the deploy environment.

**Throw an `Error` to fail the check** — the thrown message is what
shows up in Checkly's failure detail. **Use `console.log` for
non-blocking notes** (visible in the check's run log either way). A
script that runs to completion without throwing passes.

```js
// Minimal example
if (response.statusCode !== 200) {
  throw new Error('Expected 200, got ' + response.statusCode);
}
```

```js
// Parsing JSON and checking a field
const body = JSON.parse(response.body);
if (body.status !== 'ok') {
  throw new Error('Expected status "ok", got "' + body.status + '"');
}
console.log('Response time budget check: ' + response.timings.duration + 'ms');
```

**If you're building a UI that lets someone author this script**: the
contract above (`response`/`request`/`process.env` in scope, throw to
fail) is the whole surface to validate/hint against — there's nothing
else this kind adds on top of Checkly's own teardown-script mechanics.
Script max execution time is 10 seconds (a Checkly platform limit, not
specific to this kind).

## When to reach for a different kind instead

If your check is really "hit a JSON health endpoint and check a status
field with healthy/degraded/unhealthy severity", [dotnet-health](../dotnet-health/README.md)
already does that (and is itself just a thin, purpose-built preset over
the same tearDownScript mechanism) — no need to hand-write that logic
here. If your check needs a full browser (DOM assertions, multi-step
navigation, JS-rendered content), this kind isn't it either — that's a
`BrowserCheck` with an inline Playwright script (`code.content`), a
different Checkly construct entirely; this repo's `launch-readiness`,
`gdpr`, and `xpath-spa` kinds are examples of that shape.

Default schedule: `EVERY_15M`.
