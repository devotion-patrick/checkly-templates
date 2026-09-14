# uptime-ssl-check

UrlMonitor kind: basic uptime monitoring (URL returns a success status
code, with no unexpected redirect along the way) plus TLS-certificate
expiry alerting. **Billed by monitor count, not by run** — unlike every
other kind in this repository — which is why it defaults to running
every minute for free.

For a missing security header, see the separate `security-headers`
kind: a UrlMonitor is declarative-only (status-code assertions, no
script), so it cannot itself report anything softer than pass/fail.

## Consumer config

```json
{
  "kind": "uptime-ssl",
  "logicalId": "acme-home-prod-uptime",
  "env": "PROD",
  "url": "https://www.acme.com",
  "sslCertificateExpiryThresholdDays": 30
}
```

| Field                              | Required | Notes                                                          |
| ---------------------------------- | -------- | -------------------------------------------------------------- |
| `sslCertificateExpiryThresholdDays`| no       | Days before expiry to start alerting. Default `30`             |
| `successStatusRange`               | no       | `{ min, max }` inclusive. Default `{ "min": 200, "max": 299 }` |

Plus the common entry fields. The check's SSL domain is derived from
the URL hostname automatically.

## Severity

`followRedirects` is off, so a redirect response's own status code
(3xx) falls outside `successStatusRange` and fails the assertion
directly — there is no script to inspect the response body or headers
any other way. A status code outside `successStatusRange` fails for
the same reason.

## Default schedule

`EVERY_1M` from `eu-central-1` + `ap-southeast-2`.
Override via the entry's `frequency` / `locations` or the project's
`defaults` block.
