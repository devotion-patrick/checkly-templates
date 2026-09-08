# dotnet-health-check

ApiCheck kind tailored to ASP.NET Core's standard
[Health Checks](https://learn.microsoft.com/aspnet/core/host-and-deploy/health-checks)
JSON response, but the status field's path and its healthy/degraded
values are all overridable — so it also covers any other JSON
health-check convention (Spring Boot Actuator's `UP`/`DOWN`, a custom
in-house shape, etc.), not just ASP.NET Core's.

**Severity, not just pass/fail**: a *degraded* response is reported as a
non-blocking warning by default (visible in the check's log, doesn't
fail the check) — only *unhealthy* fails it. Set `failOnDegraded: true`
per entry if you want zero tolerance instead. This is why the check no
longer relies on declarative `statusCode`/`jsonBody` assertions: ASP.NET
Core's default status-code mapping sends the *same* HTTP 200 for both
Healthy and Degraded, so a status-code check alone can't see Degraded at
all, and a strict body-equality check can't tell "degraded" from
"unhealthy" — both just "don't equal Healthy". A teardown script
(`tearDownScript`, see [Checkly's setup/teardown docs](https://www.checklyhq.com/docs/detect/synthetic-monitoring/api-checks/setup-and-teardown/))
inspects the real response body and classifies it explicitly instead.

## Consumer config

Two shapes work, pick whichever reads better:

```json
{
  "kind": "dotnet-health",
  "url": "https://api.acme.com/health",
  "expectedComponents": ["sql", "redis"]
}
```

…or, if your `url` is a base URL and you want the kind to append a path:

```json
{
  "kind": "dotnet-health",
  "url": "https://api.acme.com",
  "healthPath": "/health",
  "expectedComponents": ["sql", "redis"]
}
```

If your endpoint isn't ASP.NET Core's exact response shape:

```json
{
  "kind": "dotnet-health",
  "url": "https://api.acme.com/actuator/health",
  "statusPath": "$.status",
  "componentsPath": "$.components['{name}'].status",
  "healthyValues": ["UP"],
  "degradedValues": [],
  "expectedComponents": ["db", "diskSpace"]
}
```

| Field                   | Required | Notes                                                          |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `healthPath`            | no       | If set, appended to `url`. Leave unset if `url` is already the health endpoint |
| `statusPath`            | no       | JSONPath to the overall status field. Default `$.status` |
| `componentsPath`        | no       | JSONPath template for a component's status, `{name}` substituted. Default `$.results['{name}'].status` — **note**: the `AspNetCore.HealthChecks.UI.Client` package's default writer actually nests components under `entries`, not `results`; check your real response and override if needed |
| `expectedComponents`    | no       | Named components checked at `componentsPath` with the same healthy/degraded/unhealthy severity as the overall status |
| `healthyValues`         | no       | Values that count as fully healthy. Default `["Healthy"]` |
| `degradedValues`        | no       | Values that count as degraded (a warning, not a failure — unless `failOnDegraded`). Default `["Degraded"]`. Anything not healthy or degraded fails the check |
| `failOnDegraded`        | no       | Treat degraded the same as unhealthy (hard fail). Default `false` |
| `expectedOverallStatus` | no       | Deprecated alias for `healthyValues: [expectedOverallStatus]`. Only used when `healthyValues` is unset |
| `headers`               | no       | Extra request headers. Use `{{VAR}}` to reference Checkly env vars for secrets (see below) |

## Authenticating to the health endpoint

If your health endpoint is gated by a shared-secret header
(e.g. `X-Health-Key: <secret>`), the secret lives in your CI's secret
store and reaches the Checkly check via three plumbed-together pieces.
Naming each link in the chain so you can audit it end-to-end:

```
Key Vault secret      e.g. "dotnet-health-check-default-api-key"
        ↓ (linked via the variable group named in checklyCredentialsGroup)
ADO variable          "dotnet-health-check-default-api-key" (KV names get
                       dash-cased; ADO doesn't rename them on link)
        ↓ (alias declared in your consumer pipeline `variables:` block)
ADO variable          "HEALTH_KEY" (your choice of env-var-friendly name)
        ↓ (mapped into the script env by the template's secretEnvVars param)
process env in Node   process.env.HEALTH_KEY = <secret value>
        ↓ (the factory reads it via `valueFromEnv` in checks.json)
Per-check Checkly env "HEALTH_KEY" on the check construct (scoped to its logicalId)
        ↓ (the factory rewrites the header value to `{{HEALTH_KEY}}`)
HTTP header at run    X-Health-Key: <secret> ← resolved server-side by Checkly
```

You author **three** pieces of config. Each one is needed:

### 1. In your consumer pipeline (`*.yml`) — alias the KV-named variable to an env-var-friendly name

ADO can't rename KV-linked variables in-place. You alias with a second
inline variable that resolves to the first:

```yaml
variables:
  - group: kv-devtest-infra              # links the variable group from KV
  - name: HEALTH_KEY                     # your underscored alias
    value: $(dotnet-health-check-default-api-key)
```

### 2. In your consumer pipeline (`*.yml`) — opt the alias into the script step env

ADO does **not** expose secret variables (or variables aliased from
secrets) to script env automatically. You list them on the template
parameter:

```yaml
extends:
  template: templates/azuredevops/deploy.yml@checklyTemplates
  parameters:
    configPath: .checkly/checks.json
    checklyCredentialsGroup: kv-devtest-infra
    secretEnvVars:
      - HEALTH_KEY
```

### 3. In your `checks.json` config — declare which header reads which env var

```json
{
  "kind": "dotnet-health",
  "logicalId": "acme-api-prod-health",
  "env": "PROD",
  "url": "https://api.acme.com/healthz/ready",
  "headers": [
    { "key": "X-Health-Key", "valueFromEnv": "HEALTH_KEY" }
  ],
  "smoke": true,
  "monitor": true
}
```

`valueFromEnv` references the same name you aliased in step 1 and
forwarded in step 2. The factory reads `process.env.HEALTH_KEY` at
deploy time, stashes it as a per-check Checkly env var on this
construct (scoped to `logicalId: acme-api-prod-health` — sibling
checks don't see it), and rewrites the header to `{{HEALTH_KEY}}`
which Checkly resolves at run time from that per-check env.

If any of these three pieces is missing, the deploy fails loudly with
a message naming both the check's logicalId and the missing env var.

### Other CI systems

- **GHA**: same shape. Add `HEALTH_KEY` as a repository or environment
  secret. Pass it on the calling job's `env:` block. The reusable
  workflow inherits it.
- **Local `npm run try:*`**: add `HEALTH_KEY=...` to
  `local-testing/.env`. `try-config.mjs` loads it automatically.

### Non-secret headers

If a header value isn't a secret, just use `value` instead of
`valueFromEnv`:

```json
{ "key": "X-Tenant", "value": "acme" }
```

Schema rule: each entry in `headers` sets **exactly one** of `value`
or `valueFromEnv`. Both-or-neither is rejected.

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

This is the shape this kind's defaults assume (`componentsPath: "$.results['{name}'].status"`). If your
endpoint instead uses the `AspNetCore.HealthChecks.UI.Client` NuGet
package's own default writer, its response nests components under
`entries`, not `results` — set `"componentsPath": "$.entries['{name}'].status"`
if that's what your endpoint actually returns.

Default schedule: `EVERY_5M` from `eu-central-1` + `ap-southeast-2`.
