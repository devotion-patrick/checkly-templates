// Auto-discovered by Checkly's CLI via the `*.check.ts` glob. This is
// where every consumer-config entry actually gets turned into a Checkly
// construct.
//
// We do construct creation here (not in checkly.config.ts) because
// Checkly v7 rejects `new ApiCheck(...)` etc. from inside the config
// file with:
//
//   "Creating a ApiCheck construct in the Checkly config file isn't supported."
//
// Each construct registers itself with the active Checkly session on
// instantiation; that's the side effect we want.
//
// Per-entry purpose filtering
// ---------------------------
// CHECKLY_PURPOSE controls which entries get registered:
//   - "test"     -> only entries with `smoke: true`
//   - "monitor"  -> only entries with `monitor: true`
//   - unset/any  -> every entry
//
// The pipeline templates set CHECKLY_PURPOSE per pass so a single
// consumer config can drive both `checkly test` (release-gate) and
// `checkly deploy` (continuous monitor) cleanly.

import { buildContext, loadConsumerConfig } from './load-config.ts';
import { getModule } from './registry.ts';

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
