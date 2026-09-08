// Deliberately delegates to launch-readiness's own buildCheckEnv rather
// than reimplementing CMS-gating logic a second time. This kind is a
// thin, purpose-built preset over exactly that mechanism (see
// launch-readiness/schema.ts's expectPubliclyAccessible doc) — CHECK_KIND
// stays "launch-readiness" so the existing, tested spec file runs
// unchanged; only the consumer-facing schema differs (two required
// fields instead of launch-readiness's full surface).

import { buildCheckEnv as buildLaunchReadinessCheckEnv, type CheckEnv } from '../launch-readiness/env.ts';
import type { LaunchReadinessEntry } from '../launch-readiness/schema.ts';
import type { RestrictedAdminEntry } from './schema.ts';

export function buildCheckEnv(entry: RestrictedAdminEntry): CheckEnv {
  const asLaunchReadiness: LaunchReadinessEntry = {
    ...entry,
    kind: 'launch-readiness',
    expectPubliclyAccessible: entry.expectedAccess === 'gated' ? false : 'either',
    checks: { securityHeaders: entry.securityHeaders ?? [] },
  };
  return buildLaunchReadinessCheckEnv(asLaunchReadiness);
}
