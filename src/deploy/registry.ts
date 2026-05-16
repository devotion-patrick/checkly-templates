import { gdprModule } from '@checkly-templates/gdpr';
import { uptimeSslModule } from '@checkly-templates/uptime-ssl';
import { redirectModule } from '@checkly-templates/redirect';
import { dotnetHealthModule } from '@checkly-templates/dotnet-health';
import { xpathModule } from '@checkly-templates/xpath';
import { xpathSpaModule } from '@checkly-templates/xpath-spa';
import type { KindModule } from './types.ts';

// Order here drives the order entries appear in `$defs.entryKinds.oneOf`
// of the generated schema, which in turn drives the order kinds appear
// in editor auto-complete. The widened factory type below (factory
// expects a `CommonEntryFields`-shaped input) hides per-kind discriminated
// types from the registry; the runtime guarantee is that getModule(entry.kind)
// returns the module whose factory accepts that entry shape.
export const MODULES: ReadonlyArray<KindModule<any>> = [
  uptimeSslModule,
  redirectModule,
  dotnetHealthModule,
  xpathModule,
  xpathSpaModule,
  gdprModule,
];

export const REGISTRY: Readonly<Record<string, KindModule<any>>> = Object.freeze(
  Object.fromEntries(MODULES.map((m) => [m.kind, m])),
);

export function getModule(kind: string): KindModule<any> {
  const mod = REGISTRY[kind];
  if (!mod) {
    const allowed = MODULES.map((m) => m.kind).join(', ');
    throw new Error(`Unknown check kind "${kind}". Allowed: ${allowed}`);
  }
  return mod;
}

export function hasPlaywrightKinds(kinds: ReadonlyArray<string>): boolean {
  return kinds.some((k) => REGISTRY[k]?.isPlaywright === true);
}
