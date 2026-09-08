# restricted-admin

PlaywrightCheck kind dedicated to one question: **is this admin/CMS URL's
access posture correct?** It's a separate, first-class kind in the registry
rather than a "recipe" on top of `launch-readiness` — but under the hood it
delegates to launch-readiness's exact `expectPubliclyAccessible` mechanism
and reuses its Playwright spec verbatim (see [`env.ts`](./env.ts)), so there's
no second copy of the CMS-gating logic to maintain.

## Consumer config

```json
{
  "kind": "restricted-admin",
  "logicalId": "acme-cms-admin",
  "url": "https://www.acme.com/admin",
  "expectedAccess": "gated",
  "securityHeaders": ["X-Frame-Options", "Strict-Transport-Security"],
  "smoke": true
}
```

| Field              | Required | Notes |
| ------------------ | -------- | ----- |
| `expectedAccess`   | **yes**  | `"gated"` or `"either"` — see below. No default; this is the one thing the check exists to assert |
| `securityHeaders`  | no       | Response headers required when the endpoint is reachable (checked in both modes) |
| `waitUntil`        | no       | Playwright page-load wait condition. Default `domcontentloaded` |
| `followJsRedirect` | no       | Follow a client-side (JS) redirect fired after load instead of reporting it and stopping. Default `false` |

## `expectedAccess`

- **`"gated"`** — this URL must require auth. Being reachable without it
  (a 2xx response) is itself the failure. A non-2xx (401/403, or a
  network-level block) is the expected, passing state. If it turns out to be
  reachable, the check distinguishes a real login form (full-severity
  failure) from the site's homepage served by mistake at that path
  (downgraded to a warning) — a common false-positive when a CMS falls back
  to serving the homepage for unmatched routes instead of a proper 404/redirect.
- **`"either"`** — public access is a legitimate per-client choice here, not
  a defect either way (e.g. editors who need to log in from arbitrary
  locations, or an admin path that's intentionally not IP-restricted). The
  check never fails on reachability alone; only `securityHeaders` runs, when
  the endpoint is reachable.

## Why a dedicated kind instead of a `launch-readiness` config recipe

The same result is achievable by hand-configuring `launch-readiness` with
just `expectPubliclyAccessible` and `checks.securityHeaders` set and every
other check omitted. This kind exists anyway so that a consumer (e.g. an
external UI) gets a small, purpose-built schema — two required-ish fields,
not launch-readiness's full surface — for what is, in practice, a distinct
and common use case (auditing admin/CMS access posture) worth surfacing as
its own thing in the registry, the schema's `oneOf`, and any UI built on top
of it. It's a thin preset, not a fork: `CHECK_KIND` stays `launch-readiness`
at runtime (see [`env.ts`](./env.ts)), so the actual assertion logic is
launch-readiness's own, already-tested spec.

## Default schedule

`EVERY_15M`. Unlike most `launch-readiness` checks (which audit things that
only change at deploy time), an admin endpoint accidentally becoming public
is the kind of regression worth catching quickly.
