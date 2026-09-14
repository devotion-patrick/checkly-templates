# security-headers-check

MultiStepCheck kind: required response headers are present on a URL.
Split out of `uptime-ssl` (which moved to a free UrlMonitor with no
script, and so can no longer run this check itself).

Overlaps in intent with `launch-readiness`'s own `securityHeaders`
check, deliberately — that kind stays as the more comprehensive
pre-launch audit, and this one exists for a client who wants only this
one thing, running continuously rather than as a launch gate.

## Consumer config

```json
{
  "kind": "security-headers",
  "logicalId": "acme-home-prod-headers",
  "env": "PROD",
  "url": "https://www.acme.com",
  "securityHeaders": ["X-Frame-Options", "Strict-Transport-Security"]
}
```

| Field             | Required | Notes                                                          |
| ----------------- | -------- | --------------------------------------------------------------|
| `securityHeaders`  | no       | Headers required to be present. Default: the baseline set below. |

Plus the common entry fields.

The baseline header set, applied when `securityHeaders` is left unset:

- `X-Content-Type-Options`
- `X-Frame-Options`
- `Strict-Transport-Security`
- `Referrer-Policy`
- `Content-Security-Policy`

## Severity

A missing header is reported as `Degraded`, not `Down` — Checkly's own
convention for this is a `degraded.json` file left in the working
directory (the shape the official `@checkly/playwright-helpers`
package's `markCheckAsDegraded()` writes), which this kind's script
writes by hand. A network-level failure (DNS, connection refused) still
fails the check on its own.

## Default schedule

`EVERY_24H` from `ap-southeast-2`.
Override via the entry's `frequency` / `locations` or the project's
`defaults` block.
