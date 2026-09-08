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

| Field     | Required | Notes |
| --------- | -------- | ----- |
| `method`  | no       | Default `GET`. One of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` |
| `body`    | no       | Request body (e.g. a JSON string) |
| `headers` | no       | Same shape as [dotnet-health](../dotnet-health/README.md#authenticating-to-the-health-endpoint)'s: each item sets exactly one of `value` (literal) or `valueFromEnv` (CI-sourced, per-check secret) |
| `script`  | **yes**  | The full validation script — see below |

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
