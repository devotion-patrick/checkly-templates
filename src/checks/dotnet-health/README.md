# dotnet-health-check

ApiCheck kind tailored to ASP.NET Core's standard
[Health Checks](https://learn.microsoft.com/aspnet/core/host-and-deploy/health-checks)
JSON response. Asserts overall status plus any named components you
care about.

## Consumer config

```json
{
  "kind": "dotnet-health",
  "logicalId": "acme-api-prod-health",
  "env": "PROD",
  "url": "https://api.acme.com",
  "healthPath": "/health",
  "expectedComponents": ["sql", "redis", "external-api"]
}
```

| Field                   | Required | Notes                                                      |
| ----------------------- | -------- | ---------------------------------------------------------- |
| `healthPath`            | no       | Appended to `url`. Default `/health`                       |
| `expectedComponents`    | no       | Each must report status Healthy in `$.results.<name>.status` |
| `expectedOverallStatus` | no       | Value `$.status` must equal. Default `Healthy`             |

Plus the common entry fields.

## Expected response shape

ASP.NET Core's `UseHealthChecks("/health", new HealthCheckOptions {
ResponseWriter = UIResponseWriter.WriteHealthCheckUIResponse })` returns
something like:

```json
{
  "status": "Healthy",
  "results": {
    "sql": { "status": "Healthy" },
    "redis": { "status": "Healthy" }
  }
}
```

Default schedule: `EVERY_5M` from `eu-central-1` + `ap-southeast-2`.
