# redirect-check

ApiCheck kind that asserts a URL redirects to the expected target with
the expected status code. `followRedirects` is forced `false` so the
test is meaningful — it inspects the redirect itself, not what it
eventually lands on.

## Consumer config

```json
{
  "kind": "redirect",
  "logicalId": "acme-www-redirect-prod",
  "env": "PROD",
  "url": "http://acme.com",
  "expectedStatus": 301,
  "expectedLocation": "https://www.acme.com/"
}
```

| Field              | Required | Notes                                                |
| ------------------ | -------- | ---------------------------------------------------- |
| `expectedStatus`   | no       | Integer. Default `301`                               |
| `expectedLocation` | yes      | Exact value the `Location` header must equal         |

Plus the common entry fields.

Default schedule: `EVERY_15M` from `eu-central-1`.
