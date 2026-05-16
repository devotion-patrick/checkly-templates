# uptime-ssl-check

ApiCheck kind that combines basic uptime monitoring (URL returns a
success status code) with TLS-certificate expiry alerting.

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

Default schedule: `EVERY_5M` from `eu-central-1` + `ap-southeast-2`.
Override via the entry's `frequency` / `locations` or the project's
`defaults` block.
