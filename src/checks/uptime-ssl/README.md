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
| `followRedirects`                  | no       | Follow redirects before asserting. Default `true`              |
| `shouldFail`                       | no       | Invert the outcome, for an address expected to error. Default `false` |

Plus the common entry fields. The check's SSL domain is derived from
the URL hostname automatically.

## Severity

A status code outside `successStatusRange` fails the assertion
directly — there is no script to inspect the response body or headers
any other way.

`followRedirects` is on by default, because this check answers "can a
visitor reach this site" and a visitor follows redirects: a host
answering 301 to its https or www form is reachable, not down. Turn it
off to assert on the redirect response itself, in which case its 3xx
status falls outside `successStatusRange` and fails — though the
`redirect` kind is purpose-built for that and checks the destination
too.

## An address that is supposed to error

Some addresses are correct precisely because they refuse: an admin
endpoint that must answer 403, a bare domain that must answer 404.
Setting `successStatusRange` to that status is **not enough on its
own** — Checkly counts a 4xx or 5xx as a failed request whatever the
assertions say, so the check reports failing while its assertions sit
green, which reads as a bug in the check rather than a setting.

Set both:

```json
{ "shouldFail": true, "successStatusRange": { "min": 403, "max": 403 } }
```

`shouldFail` inverts the outcome; the range says which status is the
expected one. Either alone is wrong: the range alone leaves the check
failing, and `shouldFail` alone inverts a healthy check into a failing
one.

Verified against a live URL monitor answering 403. Note that
`checkly/constructs` documents `shouldFail` as applying to API checks
only — that is not true of a `UrlMonitor`, which honours it.

## Default schedule

`EVERY_1M` from `eu-central-1` + `ap-southeast-2`.
Override via the entry's `frequency` / `locations` or the project's
`defaults` block.
