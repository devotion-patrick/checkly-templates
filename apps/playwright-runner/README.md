# Playwright runner app

Runs the four Playwright-based check kinds — `gdpr`, `xpath-spa`,
`launch-readiness`, `restricted-admin` — directly via local Playwright. **No
Checkly account, no `CHECKLY_API_KEY`/`CHECKLY_ACCOUNT_ID`, no cloud test
session, and no dependency on the `checkly` package at all** (check
`package.json` — it's not even listed).

## Why a separate app from `checkly-runner`

[`apps/checkly-runner`](../checkly-runner/README.md) runs every kind
(including the five `ApiCheck` kinds — `uptime-ssl`, `redirect`,
`dotnet-health`, `xpath`, `custom-api`) through `npx checkly test`, which
dispatches to Checkly's cloud infrastructure. That's the only way to run an
`ApiCheck` kind at all: its `request`/`assertions` (or, for `custom-api`, its
user-authored `tearDownScript`) is Checkly's own DSL/runtime, evaluated by
Checkly's runner, not plain local code.

The four Playwright kinds are different: their actual check logic lives in
plain Playwright spec files under `src/checks/<kind>/__checks__/*.spec.ts` —
no Checkly SDK involved (`restricted-admin` reuses `launch-readiness`'s spec
verbatim rather than having its own — see its `env.ts`). The only thing
Checkly's `PlaywrightCheck` construct does for these is set three env vars
(`CHECK_KIND`, `CHECK_TARGET_URL`, `CHECK_PARAMS`) and hand the spec to its
cloud runner. This app does the same env-var setup and runs the spec with a
plain local `npx playwright test` instead — so it works with zero Checkly
dependency, is free, and needs no credentials.

Each kind's `CHECK_PARAMS` shape is built by a small pure function,
`buildCheckEnv()`, in `src/checks/<kind>/env.ts` — deliberately kept free of
any `checkly/constructs` import. Both this app and `checkly-runner`'s
`factory.ts` (via `@checkly-templates/*`) call the same function, so the two
runners can't drift apart on what a check kind's env vars look like.

**Out of scope:** `uptime-ssl`, `redirect`, `dotnet-health`, `xpath`,
`custom-api`. Entries of those kinds are reported as skipped, not run — use
`apps/checkly-runner` for those.

## Run

```bash
cd apps/playwright-runner
npm install   # first time only

node run.mjs                          # every smoke:true entry in the default config
node run.mjs --grep launch-readiness  # only entries whose kind or logicalId matches
```

From the repo root: `npm run test --workspace @checkly-templates/playwright-runner`.

## Audit report

[`audit-report.mjs`](./audit-report.mjs) drives every `launch-readiness`
entry in a config through the same local-Playwright mechanism as `run.mjs`,
concurrently, and emits a structured JSON report (grouped by security-header
fails, other content/SEO fails, warnings, and a status label for gated CMS
endpoints) instead of pass/fail console output. This is what generates the
data behind the "Pre-launch check audit" Confluence page.

```bash
node audit-report.mjs                                          # devotion_sites-launch-readiness.json, concurrency 6
node audit-report.mjs --config path/to/config.json --concurrency 10 --out report.json
```

`report.json` and any Confluence body generated from it are run artifacts,
not something to commit — regenerate on demand when the page needs a
refresh.

## Configs

Configs are **shared with `apps/checkly-runner`**, not duplicated — by
default this app reads
[`../checkly-runner/configs/_examples.json`](../checkly-runner/configs/_examples.json).
Point at a different file the same way:

```bash
CHECKLY_TEMPLATES_CONFIG=../checkly-runner/configs/my-site.json node run.mjs
```

The config is validated against the same
[`src/deploy/schema.json`](../../src/deploy/schema.json) both apps and the
real deploy pipeline use.

## How it's wired

- [`run.mjs`](./run.mjs) — the orchestrator. Validates the config, filters
  to `smoke: true` entries of a Playwright kind, and for each one spawns
  `npx playwright test` in this folder with that entry's env vars set.
- [`playwright.config.ts`](./playwright.config.ts) — points `testDir` at the
  repo's shared specs under `src/checks/*/__checks__`. Every spec self-skips
  unless `CHECK_KIND` matches the one `run.mjs` set for that invocation.
- `src/checks/<kind>/env.ts` (per Playwright kind) — the checkly-free
  `buildCheckEnv(entry)` this app imports directly via
  [`jiti`](https://github.com/unjs/jiti), with no build step.
