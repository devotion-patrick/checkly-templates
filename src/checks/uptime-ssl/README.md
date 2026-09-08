# uptime-ssl-check

ApiCheck kind that combines basic uptime monitoring (URL returns a
success status code, with no unexpected redirect along the way) with
TLS-certificate expiry alerting and a baseline security-header check.

## Consumer config

```json
{
  "kind": "uptime-ssl",
  "logicalId": "acme-home-prod-uptime",
  "env": "PROD",
  "url": "https://www.acme.com",
  "sslCertificateExpiryThresholdDays": 30,
  "securityHeaders": true
}
```

| Field                              | Required | Notes                                                          |
| ---------------------------------- | -------- | -------------------------------------------------------------- |
| `sslCertificateExpiryThresholdDays`| no       | Days before expiry to start alerting. Default `30`             |
| `successStatusRange`               | no       | `{ min, max }` inclusive. Default `{ "min": 200, "max": 299 }` |
| `securityHeaders`                  | no       | `true` (default): a baseline set. `false`: skip. An array of header names: check exactly these instead. |

Plus the common entry fields. The check's SSL domain is derived from
the URL hostname automatically.

## Severity

`followRedirects` is off: a redirect is now a failure in its own right,
reported as `Down`, rather than being resolved silently and judged only
on where it landed. So is a status code outside `successStatusRange`.

A missing security header is a softer finding — reported as `Degraded`,
not `Down`. Checkly itself has no notion of assertion-level severity (a
check either passed or it didn't), so this kind runs all of its checks
in a teardown script rather than declarative assertions, and throws a
distinguishable `DEGRADED: ...` message for a header-only finding. The
consuming portal reads that message to tell the two apart; see
`ChecklyHealthProvider.ToStatus` in the portal repo.

The baseline header set, applied when `securityHeaders` is left at its
default `true`:

- `X-Content-Type-Options`
- `X-Frame-Options`
- `Strict-Transport-Security`
- `Referrer-Policy`
- `Content-Security-Policy`

## Default schedule

`EVERY_5M` from `eu-central-1` + `ap-southeast-2`.
Override via the entry's `frequency` / `locations` or the project's
`defaults` block.
