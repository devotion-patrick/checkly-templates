# Changelog

All notable changes to `checkly-templates` are documented here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
versioning is [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial unified-config scaffold. One consumer config (JSON) describes
  all checks across all kinds; one pipeline template per CI system
  deploys them to a single Checkly project per consumer.
- Six kind modules under `src/checks/`: `gdpr`, `uptime-ssl`, `redirect`,
  `dotnet-health`, `xpath`, `xpath-spa`.
- Shared utilities under `src/shared/`: tag auto-emission
  (`source:` / `app:` / `env:` / `kind:` triple), frequency helpers,
  GDPR EU/UK/CA preset.
- Pipeline templates: `.azdevops/templates/deploy.yml`,
  `.github/workflows/templates/deploy.yml`.
- Local sandbox: `npm run try` / `try:test` / `try:preview` / `try:deploy`
  / `try:both`, auto-loading credentials from a gitignored
  `local-testing/.env` file.
- **Per-entry `smoke` / `monitor` purpose flags.** Each check in the
  consumer config independently declares whether it's a release-time
  smoke gate, a continuous monitor, or both. At least one of the two
  must be `true`; the schema rejects entries that don't choose. The
  pipeline templates run two passes by default (smoke first, then
  monitors), filtering by the `CHECKLY_PURPOSE` env var. Lets a single
  config drive `checkly test` (release gate) and `checkly deploy`
  (monitor) cleanly, including the common pattern where uptime is
  handled by another tool (e.g. Better Stack) and Checkly is reserved
  for the assertion-heavy kinds.

### Architecture notes for downstream forks

Two non-obvious Checkly v7 constraints surfaced during live testing. If
you fork and add new kinds, you need to know these:

- **Constructs cannot be created inside `checkly.config.ts`.** Calling
  `new ApiCheck(...)` or `new PlaywrightCheck(...)` from the config file
  fails with *"Creating a ApiCheck construct in the Checkly config file
  isn't supported."* All construct instantiation happens in
  [`src/deploy/all.check.ts`](./src/deploy/all.check.ts), which the CLI
  auto-discovers via the default `*.check.ts` glob. `checkly.config.ts`
  only carries project metadata and the `checkMatch` pointer.

- **Workspace cross-package deps must not be listed in any
  `package.json` whose folder Checkly's cloud bundler walks into.**
  Checkly's `PlaywrightCheck` bundler walks up from the spec file, finds
  the nearest `package.json`, and runs `npm install --no-save` against
  it in the sandboxed runtime. Workspace packages like
  `@checkly-templates/shared` 404 on the public npm registry, so the
  check fails before its spec ever runs. Local resolution still works
  via npm-workspace hoisting at the repo root; the deps are simply not
  enumerated in any nested `package.json`. See
  [`src/deploy/package.json`](./src/deploy/package.json) for the
  inline note.

### Known gaps

- `sslCertificateExpiryThresholdDays` is accepted on `uptime-ssl`
  entries but not yet wired to a Checkly alert channel; Checkly v7
  configures SSL expiry alerting at the alert-channel level
  (`sslExpiry: true`, `sslExpiryThreshold: <days>`), not per-check.
- `xpath` has no regex matcher — Checkly's `textBody()` exposes
  only `contains` / `notContains`. Use `xpath-spa` for regex needs.
- `redirect.expectedStatus` is a single integer (no `isOneOf`-style
  alternation in v7's `statusCode()` assertion API).
