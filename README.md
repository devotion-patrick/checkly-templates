# checkly-templates

Opinionated, reusable [Checkly](https://www.checklyhq.com/) check
definitions plus deploy pipeline templates for Azure DevOps and GitHub
Actions. Drop one JSON config into your repo, reference one pipeline
template, and you have monitors and release-time smoke gates managed as
code.

Each check in the config independently declares whether it runs as a
**release-time smoke gate** (`smoke: true` → `checkly test`), a
**continuous monitor** (`monitor: true` → `checkly deploy`), or both.
The pipeline template runs both passes by default; each pass picks up
the entries that opted in.

## What you get

Six built-in check kinds, all expressible in a single unified config:

| `kind`              | Backed by         | Use for                                                 |
| ------------------- | ----------------- | ------------------------------------------------------- |
| `uptime-ssl`        | `ApiCheck`        | URL is 2xx + TLS cert (cert wiring TBD; see CHANGELOG)  |
| `redirect`          | `ApiCheck`        | URL returns expected redirect status + `Location`       |
| `dotnet-health`     | `ApiCheck`        | ASP.NET Core `/health` returns `Healthy` + components   |
| `xpath`             | `ApiCheck`        | Response body contains / does-not-contain substrings    |
| `xpath-spa`         | `PlaywrightCheck` | DOM selector assertions on a JS-rendered page           |
| `gdpr`              | `PlaywrightCheck` | No tracking cookies/requests before consent (EU/UK/CA)  |

Plus one reusable deploy template per CI system. The consumer footprint
is one config file plus ~10 lines of YAML.

If you already have uptime / latency monitoring elsewhere (Better Stack,
Datadog Synthetics, etc.), set `monitor: false` on the corresponding
entries — let Checkly handle the assertion-heavy stuff (GDPR, DOM
content, structured JSON-body assertions) only.

## Consumer footprint

`.checkly/checks.json` in your repo:

```json
{
  "$schema": "https://github.com/devotion-patrick/checkly-templates/releases/download/v0.1.0/schema.json",
  "project": {
    "logicalId": "acme-corporate-checks",
    "name": "Acme - Corporate Website",
    "codename": "acme",
    "tagPrefix": "acme",
    "defaults": { "frequency": "EVERY_15M", "locations": ["ap-southeast-2"] }
  },
  "checks": [
    {
      "kind": "uptime-ssl",
      "logicalId": "acme-home-prod-uptime",
      "env": "PROD",
      "url": "https://www.acme.com",
      "smoke": false,
      "monitor": true
    },
    {
      "kind": "gdpr",
      "logicalId": "acme-home-prod-gdpr",
      "env": "PROD",
      "url": "https://www.acme.com",
      "complianceMode": "targeted",
      "preset": "eu-uk-ca",
      "smoke": true,
      "monitor": true
    }
  ]
}
```

Every entry must set at least one of `smoke: true` / `monitor: true`.
At a glance:

| Pattern                          | Meaning                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `smoke: true,  monitor: false`   | Release-time gate only. Catches regressions in the PR being shipped. |
| `smoke: false, monitor: true`    | 24/7 monitor only. Catches drift that doesn't correlate with a deploy. |
| `smoke: true,  monitor: true`    | Both. Best for things like GDPR where you want PR-time AND drift coverage. |

Azure DevOps pipeline (`azure-pipelines.yml`):

```yaml
resources:
  repositories:
    - repository: checklyTemplates
      type: github
      name: devotion-patrick/checkly-templates
      ref: refs/tags/v0.1.0

stages:
  - template: templates/azuredevops/deploy.yml@checklyTemplates
    parameters:
      configPath: .checkly/checks.json
      checklyCredentialsGroup: checkly-prod
```

GitHub Actions equivalent lives at
[`examples/consumer-pipeline.github.yml`](./examples/consumer-pipeline.github.yml).

## Project shape

```
checkly-templates/
├── src/
│   ├── deploy/                # entry point (checkly.config.ts, loader, registry, schema)
│   ├── shared/                # cross-cutting helpers (tags, presets, types)
│   └── checks/                # one folder per kind
│       ├── gdpr/              # PlaywrightCheck + spec
│       ├── uptime-ssl/        # ApiCheck factory
│       ├── redirect/          # ApiCheck factory
│       ├── dotnet-health/     # ApiCheck factory
│       ├── xpath/             # ApiCheck factory (body substring assertions)
│       └── xpath-spa/         # PlaywrightCheck + spec (DOM selectors)
├── examples/                  # paste-and-edit consumer config + pipeline files
├── scripts/                   # try-config.mjs, inspect-config.mjs
├── templates/azuredevops/     # ADO deploy template (consumer-facing)
└── .github/workflows/         # this repo's CI/release + consumer GHA deploy.yml
```

## Conventions

**Tags.** Every check gets `source:checkly-templates` so anything
managed by this repo is identifiable in the Checkly UI. This tag is
always emitted bare, never under a `tagPrefix`. When you set
`project.tagPrefix` and `project.codename`, you additionally get
`<prefix>.codename:<codename>`, `<prefix>.env:<env>`, and
`<prefix>.kind:<kind>`. Free-form `tags: []` on project or entry are
merged in.

**`env` is inheritable.** Set `project.defaults.env` once and every
entry inherits it. Set `env` on an individual entry to override the
project default. Deploy fails fast if neither level supplies a value.

**Check names.** Each check is named
`{codename|project.name} - {env} - {kind} - {url}` automatically.
Set `name` on an entry to override the auto-composed name verbatim.

**Project = Checkly project.** `project.logicalId` is the Checkly
project's `logicalId`. One config = one Checkly project, every check
lands inside it.

**Locations are explicit.** Every check needs locations set at the entry
or project level. There are no kind-level location defaults (a kind
shouldn't decide where the consumer's monitor runs). If neither
`project.defaults.locations` nor the entry's `locations` is set, the
deploy errors out with a clear message naming the entry. Easiest path
is to set `project.defaults.locations` once and let entries inherit:

```json
"project": {
  "defaults": { "locations": ["ap-southeast-2"] }
}
```

**Playwright tooling on-demand.** The pipeline only installs Chromium
when the consumer config references a Playwright kind (`gdpr` or
`xpath-spa`). API-only configs deploy with just Node.

## Trying a config locally

Same machinery the pipelines use, runnable from your machine.

```pwsh
# One-time setup: drop your Checkly creds into a gitignored .env file.
cp local-testing/.env.example local-testing/.env
# (edit local-testing/.env and fill in CHECKLY_API_KEY + CHECKLY_ACCOUNT_ID)

npm run try                                  # validate config + factories. No network, no creds.
npm run try:test                             # smoke gate: `checkly test` against entries with smoke=true.
npm run try:preview                          # diff: `checkly deploy --preview` against entries with monitor=true.
npm run try:deploy                           # apply: `checkly deploy` against entries with monitor=true.
npm run try:both                             # test (smoke) THEN deploy (monitors). What the pipeline does.
npm run try:preview -- --config local-testing/my-sandbox.json
```

`try:test` / `preview` / `deploy` / `both` need `CHECKLY_API_KEY` and
`CHECKLY_ACCOUNT_ID`. The script auto-loads them from
`local-testing/.env` if it exists; otherwise it reads them from your
shell environment.

**Deploy safety.** `try:deploy` and `try:both` persist monitors in your
Checkly account. Use a sandbox account or a unique `project.logicalId`
(e.g. `sandbox-<yourname>-checks`) so you don't stomp on production.
The auto-emitted `source:checkly-templates` tag still makes managed
checks identifiable in the Checkly UI.

## The two-pass execution model

The pipeline templates default to `mode: both`, which means each
trigger does two independent passes against the same config:

1. **Smoke pass** — sets `CHECKLY_PURPOSE=test`, runs `checkly test`.
   Only entries with `smoke: true` register. A failure in this pass
   fails the pipeline before the monitor pass runs.
2. **Monitor pass** — sets `CHECKLY_PURPOSE=monitor`, runs `checkly deploy`.
   Only entries with `monitor: true` register, so the persistent
   Checkly project contains exactly the monitor-purposed entries.

Both passes read the same JSON file; per-entry booleans drive the
filtering. Set the template's `mode` parameter to `test` or `monitor`
to run only one pass.

## Versioning and `$schema`

Every tag ships an immutable `schema.json` as a GitHub Release asset.
Pin the version in your `$schema` URL:

```
https://github.com/devotion-patrick/checkly-templates/releases/download/<tag>/schema.json
```

That URL is guaranteed never to change content for a given tag, so a
schema update on this side can't quietly invalidate your config — you
opt in by bumping the tag in your `$schema`.

## License

[MIT](./LICENSE).
