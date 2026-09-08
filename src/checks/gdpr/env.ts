// Pure CHECK_* env-var builder — deliberately checkly-free (no import from
// `checkly/constructs`) so it can be shared between the Checkly-backed
// factory.ts (wraps this in a PlaywrightCheck construct) and
// apps/playwright-runner (sets these directly as process env vars and
// invokes `playwright test` locally, with no Checkly dependency at all).
// Preset resolution lives here too, since CHECK_PARAMS needs the resolved
// rules, not the raw preset name/overrides.

import { gdprEuUkCa } from '@checkly-templates/shared';
import {
  KIND,
  type GdprCustomRules,
  type GdprEntry,
  type GdprOverrides,
  type GdprPresetName,
} from './schema.ts';

function presetRules(name: GdprPresetName): GdprCustomRules | null {
  if (name === 'none') return null;
  if (name === 'eu-uk-ca') {
    return {
      trackingDomains: [...gdprEuUkCa.trackingDomains],
      cookieBlocklist: Object.fromEntries(
        Object.entries(gdprEuUkCa.cookieBlocklist).map(([k, v]) => [k, [...v]]),
      ),
      restrictedRegions: [...gdprEuUkCa.restrictedRegions],
      restrictedChecklyLocations: [...gdprEuUkCa.restrictedChecklyLocations],
      gtmDomain: gdprEuUkCa.gtmDomain,
    };
  }
  throw new Error(`Unknown gdpr preset "${name}"`);
}

function applyOverrides(base: GdprCustomRules, overrides: GdprOverrides | undefined): GdprCustomRules {
  if (!overrides) return base;
  const next: GdprCustomRules = {
    trackingDomains: [...base.trackingDomains],
    cookieBlocklist: Object.fromEntries(Object.entries(base.cookieBlocklist).map(([k, v]) => [k, [...v]])),
    restrictedRegions: [...base.restrictedRegions],
    restrictedChecklyLocations: [...base.restrictedChecklyLocations],
    gtmDomain: overrides.gtmDomain ?? base.gtmDomain,
  };

  const td = overrides.trackingDomains;
  if (td) {
    if (td.remove?.length) next.trackingDomains = next.trackingDomains.filter((d) => !td.remove!.includes(d));
    if (td.add?.length) next.trackingDomains = [...new Set([...next.trackingDomains, ...td.add])];
  }

  const cb = overrides.cookieBlocklist;
  if (cb) {
    if (cb.remove?.length) for (const cat of cb.remove) delete next.cookieBlocklist[cat];
    if (cb.add) for (const [cat, patterns] of Object.entries(cb.add)) next.cookieBlocklist[cat] = [...patterns];
  }

  for (const key of ['restrictedRegions', 'restrictedChecklyLocations'] as const) {
    const o = overrides[key];
    if (!o) continue;
    let list = next[key];
    if (o.remove?.length) list = list.filter((x) => !o.remove!.includes(x));
    if (o.add?.length) list = [...new Set([...list, ...o.add])];
    next[key] = list;
  }

  return next;
}

export function resolveRules(entry: GdprEntry): GdprCustomRules {
  const presetName = entry.preset ?? 'eu-uk-ca';
  const base = presetRules(presetName);
  if (base === null) {
    if (!entry.rules) {
      throw new Error(
        `gdpr entry ${entry.logicalId}: preset is "none" but no explicit "rules" supplied.`,
      );
    }
    return entry.rules;
  }
  return applyOverrides(base, entry.overrides);
}

export interface CheckEnv {
  CHECK_TARGET_URL: string;
  CHECK_KIND: string;
  CHECK_PARAMS: string;
}

export function buildCheckEnv(entry: GdprEntry): CheckEnv {
  const rules = resolveRules(entry);
  return {
    CHECK_TARGET_URL: entry.url,
    CHECK_KIND: KIND,
    CHECK_PARAMS: JSON.stringify({ complianceMode: entry.complianceMode, ...rules }),
  };
}
