# Changelog

All notable changes to `checkly-templates` are documented here. Format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
versioning is [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial unified-config scaffold. One consumer config (JSON) describes
  all checks across all kinds; one pipeline template per CI system
  deploys them to a single Checkly project per consumer.
- Seven kind modules under `src/checks/`: `gdpr`, `uptime-ssl`, `redirect`,
  `dotnet-health`, `xpath`, `xpath-spa`, `launch-readiness`.
- **`launch-readiness` kind** (PlaywrightCheck) — structural launch-audit
  assertions against a URL: placeholder copy, favicon, canonical, H1
  count + heading hierarchy, image alt attributes, meta title and
  description (with optional length bounds), OG tags (with `og:image`
  fetch verification), robots.txt, XML sitemap (with optional URL
  spot-check), required response headers, custom 404 page, expected
  third-party scripts, reCAPTCHA on every `<form>`, lowercase-URL
  redirect, trailing-slash redirect. Every assertion is opt-in via
  per-entry `checks: {}`. Findings accumulate into a single
  pass/fail with a punch list (no first-fail short-circuit). Default
  cadence `EVERY_24H` — primarily a release-time gate but also
  reasonable as daily drift detection on security headers / meta tags.
- Shared utilities under `src/shared/`: tag auto-emission
  (`source:` / `codename:` / `env:` / `kind:` triple), frequency helpers,
  GDPR EU/UK/CA preset.
- Pipeline templates: `templates/azuredevops/deploy.yml`,
  `.github/workflows/deploy.yml`.
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
- **Single-file spec bundles** under `src/deploy/specs/<kind>.spec.js`,
  one per Playwright kind with its own spec (`ccpa`, `gdpr`,
  `launch-readiness`, `xpath-spa`). For consumers deploying through
  Checkly's REST API, which takes one script per check and so can't send
  a spec that imports local files. Built with esbuild by
  `src/deploy/build-specs.mjs`; CI runs `--check` to keep them fresh.
  No `KIND_VERSION` changes: check behaviour is the same.

### Changed

- **gdpr 3.4.0, ccpa 1.1.0: region from browser checks, and accepted
  findings no longer degrade.** For consumers deploying the bundled
  specs as Checkly browser checks across several locations (no
  `CHECK_LOCATION`):
  - The run location is now read from `REGION`, which browser checks
    set, as well as `CHECKLY_REGION`, which only Playwright Check Suites
    set. `REGION` is used only when it looks like a Checkly location.
    Before, these runs fell through to ipapi.co, got 429 from Checkly's
    shared IPs, and were treated as restricted, so a targeted gdpr check
    from Singapore enforced and failed.
  - What `standard` accepts is graded INFO, not WARN, since a WARN-only
    run reports Degraded. gdpr: `google-request-denied-cookieless`
    (Consent Mode advanced ping). ccpa: `restricted-processing-after-gpc`
    and `ad-script-after-gpc`. All still FAIL under `strict`.
- **gdpr 3.3.0: California removed from the default preset.** `US-CA`
  is no longer a restricted region and `us-west-1` no longer a
  restricted Checkly location. GDPR is opt-in and CCPA opt-out, so a
  CCPA-compliant site could fail its GDPR check from N. California;
  California is tested by the `ccpa` kind. The preset is renamed
  `eu-uk`; `eu-uk-ca` stays accepted as an alias for the same rules, so
  existing configs keep validating. In `targeted` mode, gdpr runs from
  `us-west-1` now log findings but don't enforce. Consumers who still
  want California held to GDPR can add `US-CA` and `us-west-1` back
  through `overrides`.

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

### Behavioural notes

- **Locations are explicit, with no kind-level defaults.** Either set
  `project.defaults.locations` (recommended) or per-entry `locations`.
  Factories throw if neither is set, naming the offending entry. This
  is deliberately stricter than the original v0.1.0 design — a kind
  deciding where the consumer's monitor runs is surprising; better to
  fail loudly. Earlier versions of this template had kind-level
  defaults that silently overrode `project.defaults.locations`; that
  behaviour is gone.
- **Smoke findings don't gate the monitor deploy.** Both passes run in
  the `mode: both` flow; the job exits non-zero if either fails, but
  monitors land in your Checkly account regardless of whether smoke
  caught something. Reasoning: missed-coverage shouldn't accumulate
  while you're fixing whatever smoke just caught.

### Known gaps

- `sslCertificateExpiryThresholdDays` is accepted on `uptime-ssl`
  entries but not yet wired to a Checkly alert channel; Checkly v7
  configures SSL expiry alerting at the alert-channel level
  (`sslExpiry: true`, `sslExpiryThreshold: <days>`), not per-check.
- `xpath` has no regex matcher — Checkly's `textBody()` exposes
  only `contains` / `notContains`. Use `xpath-spa` for regex needs.
- `redirect.expectedStatus` is a single integer (no `isOneOf`-style
  alternation in v7's `statusCode()` assertion API).
