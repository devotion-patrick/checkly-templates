# Checkly runner app

Run the template checks ad-hoc, from this folder. **Nothing is ever deployed.**

`checkly test` executes your checks in Checkly's runner and reports pass/fail
**without creating any monitors**. Deploying monitors is a separate command
(`checkly deploy`) that this app intentionally doesn't expose — so there's no
way to accidentally persist anything.

This is a self-contained Checkly project: it has its own
[`checkly.config.ts`](./checkly.config.ts) and reads a config from
[`configs/`](./configs), and consumes the template kinds
(`uptime-ssl`, `redirect`, `dotnet-health`, `xpath`, `custom-api`, `xpath-spa`,
`gdpr`, `launch-readiness`, `restricted-admin`) as libraries.

For the four Playwright-based kinds (`gdpr`, `xpath-spa`, `launch-readiness`,
`restricted-admin`), see the sibling
[`apps/playwright-runner`](../playwright-runner/README.md) if you want to run
them locally without a Checkly account at all. This app (`checkly-runner`) is
the one to use for the five `ApiCheck` kinds (`uptime-ssl`, `redirect`,
`dotnet-health`, `xpath`, `custom-api`), since those are Checkly's own
assertion/script DSL and only run through Checkly's infrastructure.

## Run

```bash
cd apps/checkly-runner

npx checkly test                      # run every check in checks.json
npx checkly test --grep uptime-ssl    # run just the uptime-ssl check
npx checkly test --grep dotnet-health # run just the dotnet-health check
npx checkly test --grep gdpr          # run just the gdpr check
```

`--grep` matches against the auto-composed check name
(`Checkly Runner - DEV - <kind> - <url>`), so grepping by kind picks that one out.

From the repo root: `npm run test --workspace @checkly-templates/checkly-runner`.

## Credentials

`checkly test` runs in Checkly's infrastructure, so it needs
`CHECKLY_API_KEY` + `CHECKLY_ACCOUNT_ID`. The config auto-loads the repo's
existing [`local-testing/.env`](../../local-testing/.env) (gitignored) if
present — the same creds you'd set up for `npm run try:*`. Otherwise export
them in your shell. (Use a sandbox Checkly account while experimenting.)

## Configs

Configs live in [`configs/`](./configs). By default the app runs
[`configs/_examples.json`](./configs/_examples.json), which has one entry per
kind (every kind covered) pointing at `https://example.com` as a reference.

To run your own set of checks, drop another file in `configs/` and point the
CLI at it:

```bash
CHECKLY_TEMPLATES_CONFIG=configs/my-site.json npx checkly test
```

Each entry needs `kind`, `logicalId`, `url`, and (schema requirement)
`smoke: true`. The `$schema` reference at the top of each config gives editor
auto-complete for every kind's fields. Field reference per kind lives in each
kind's README, e.g. [uptime-ssl](../../src/checks/uptime-ssl/README.md),
[dotnet-health](../../src/checks/dotnet-health/README.md),
[gdpr](../../src/checks/gdpr/README.md).

## How it's wired

- [`configs/`](./configs) — the configs; `_examples.json` is the default.
- [`checkly.config.ts`](./checkly.config.ts) — defines the Checkly project;
  points the shared loader at the selected config and loads creds. Creates
  **no** constructs (Checkly v7 forbids that in the config file).
- [`checks.check.ts`](./checks.check.ts) — auto-discovered via `*.check.ts`;
  turns each entry into a construct using the shared kind registry.
- [`playwright.config.ts`](./playwright.config.ts) — only needed by the
  Playwright kinds (`gdpr`, `xpath-spa`, `launch-readiness`); points at the
  repo's shared specs under `src/checks/*/__checks__`.

It reuses [`src/deploy/load-config.ts`](../../src/deploy/load-config.ts) and
[`src/deploy/registry.ts`](../../src/deploy/registry.ts), so config
validation, `env` resolution, and the kind list stay identical to the rest of
the repo — no duplicated logic.
