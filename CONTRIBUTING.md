# Contributing

Thanks for considering a contribution. This repo ships Checkly check
modules and the deploy plumbing around them; below is the shortest path
from clone to confident change.

## Setup

Requires Node 22+ (the repo uses Node-native ESM JSON imports and
`process.loadEnvFile`).

```pwsh
git clone https://github.com/devotion-patrick/checkly-templates.git
cd checkly-templates
npm install
npm run typecheck
npm run lint
npm run try            # validate the example config end-to-end, no network
```

If you want to exercise checks against a real Checkly account, copy
`local-testing/.env.example` to `local-testing/.env` and fill in your
`CHECKLY_API_KEY` and `CHECKLY_ACCOUNT_ID`. See the README's "Trying a
config locally" section. **Use a sandbox account** — `try:deploy`
persists monitors.

## Repo shape

| Path                    | What lives here                                                 |
| ----------------------- | --------------------------------------------------------------- |
| `src/deploy/`           | Entry point read by `npx checkly`. Loader, registry, schema.    |
| `src/shared/`           | Cross-cutting helpers (tags, frequency, GDPR preset, types).    |
| `src/checks/<kind>/`    | One folder per check kind. `factory.ts` + `schema.ts` + README. |
| `examples/`             | Copy-paste-edit consumer artifacts (config + pipeline YAMLs).   |
| `scripts/`              | `try-config.mjs`, `inspect-config.mjs`.                         |
| `templates/azuredevops/`| ADO reusable pipeline template (consumer-facing).               |
| `.github/workflows/`    | GHA workflows: this repo's CI + the reusable consumer `deploy.yml`. |

## Adding a new kind

Each kind module is self-contained. To add one (say, `dns-check`):

1. **Scaffold the folder** at `src/checks/dns/`:
   - `package.json` — name `@checkly-templates/dns`. **Do NOT list
     `@checkly-templates/shared` in `dependencies`** (see CHANGELOG
     "Architecture notes" — Checkly's cloud bundler reads this
     package.json and tries to npm-install it).
   - `tsconfig.json` — extends `../../../tsconfig.base.json`.
   - `schema.ts` — exports a JSON Schema fragment for the kind's
     discriminated arm (`kind: { const: 'dns' }` + per-kind fields).
   - `factory.ts` — exports `factory(entry, ctx)` returning a Checkly
     construct (`new ApiCheck(...)` or `new PlaywrightCheck(...)`) and
     a `defaults` object.
   - `index.ts` — exports a `<kind>Module: KindModule<...>` value
     conforming to the registry contract.
   - `README.md` — consumer-facing field reference.
2. **For Playwright kinds**, add `src/checks/dns/__checks__/dns.spec.ts`
   that reads `CHECK_TARGET_URL` / `CHECK_KIND` / `CHECK_PARAMS` env
   vars. The spec MUST `test.skip` itself when `CHECK_KIND !== '<kind>'`
   — the shared `playwright.config.ts` spans every kind's
   `__checks__/` folder, so each spec self-filters.
3. **Wire it into the registry**: add the import + entry to
   `src/checks/<kind>/index.ts` and `src/deploy/registry.ts`'s
   `MODULES` array. (The common-entry `smoke` / `monitor` fields and
   the at-least-one-true constraint come from
   `@checkly-templates/shared/entry-schema` automatically when you
   spread `commonEntryProperties` and inject
   `smokeOrMonitorConstraint` via `allOf` — match the existing kinds'
   shape.)
4. **Regenerate the JSON schema**: `node src/deploy/build-schema.mjs`.
5. **Add it to the example config** at `examples/consumer-checks.json`.
6. **Verify**:
   ```pwsh
   npm run typecheck
   npm run lint
   npm run try            # validates the example
   npm run try:test       # smoke pass; runs entries with smoke=true once
   npm run try:preview    # monitor pass; shows the deploy diff for entries with monitor=true
   npm run try:both       # what the pipeline does: smoke then deploy
   ```

## v7 gotchas (read before debugging)

The CHANGELOG's "Architecture notes for downstream forks" section
documents two non-obvious Checkly v7 constraints. If you're touching
`src/deploy/checkly.config.ts` or any check construct, read it first.

## Planning and history

Non-trivial changes use the planning workflow in
[AGENTS.md](./AGENTS.md). Active plans live in `./plans/`; completed
plans archive to `./plans/archived/` as read-only history. If you need
to revisit an archived topic, start a new plan that references it.

## Conventional housekeeping

- One commit = one logical change. Squash before opening a PR.
- Tests for new kind factories live alongside the kind (`__checks__/`
  for Playwright specs; pure-function tests can be co-located in
  `*.test.ts` files within the kind's folder).
- Update `CHANGELOG.md`'s `[Unreleased]` section in the same PR as the
  change.
