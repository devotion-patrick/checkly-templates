// Auto-discovered by the Checkly CLI via the `*.check.ts` glob in
// ./checkly.config.ts. This is where each entry in ./checks.json becomes a
// Checkly construct.
//
// Construct creation happens here (not in checkly.config.ts) because
// Checkly v7 rejects `new ApiCheck(...)` etc. from inside the config file.
// Each construct registers itself with the active Checkly session on
// instantiation; that's the side effect we want.
//
// We reuse the repo's shared loader + kind registry rather than
// re-implementing config loading/validation. CHECKLY_PURPOSE filtering
// matches the deploy project:
//   - "test"    -> only entries with `smoke: true`
//   - "monitor" -> only entries with `monitor: true`
//   - unset     -> every entry

import { fileURLToPath } from 'node:url';
import { buildContext, loadConsumerConfig } from '../../src/deploy/load-config.ts';
import { getModule } from '../../src/deploy/registry.ts';

// Same default as checkly.config.ts (idempotent via ??=). Set before
// loadConsumerConfig() runs; the imports above don't read it at load time.
process.env.CHECKLY_TEMPLATES_CONFIG ??= fileURLToPath(
  new URL('./configs/_examples.json', import.meta.url),
);

const config = loadConsumerConfig();
const ctx = buildContext(config);

const purpose = process.env.CHECKLY_PURPOSE;

function shouldRegister(entry: { smoke?: boolean; monitor?: boolean }): boolean {
  if (purpose === 'test') return entry.smoke === true;
  if (purpose === 'monitor') return entry.monitor === true;
  return true;
}

for (const entry of config.checks) {
  if (!shouldRegister(entry)) continue;
  const mod = getModule(entry.kind);
  mod.factory(entry, ctx);
}
