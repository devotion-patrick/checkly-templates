import { PlaywrightCheck } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import { gdprEuUkCa } from '@checkly-templates/shared';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import {
  KIND,
  type GdprCustomRules,
  type GdprEntry,
  type GdprOverrides,
  type GdprPresetName,
} from './schema.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_24H',
};

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

export function factory(entry: GdprEntry, ctx: ProjectContext): PlaywrightCheck {
  const rules = resolveRules(entry);
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? "EVERY_15M";
  const locations = resolveLocations(entry, ctx);

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry }),
    ctx.project.tags,
    entry.tags,
  );

  return new PlaywrightCheck(entry.logicalId, {
    name: `GDPR: ${ctx.project.name} - ${entry.env} - ${entry.url}`,
    playwrightConfigPath: './playwright.config.ts',
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    // Fan out across every configured location each cycle rather than
    // round-robining one location per period. For compliance we want
    // every region tested every interval.
    runParallel: true,
    environmentVariables: [
      { key: 'CHECK_TARGET_URL', value: entry.url },
      { key: 'CHECK_KIND', value: KIND },
      { key: 'CHECK_PARAMS', value: JSON.stringify({ complianceMode: entry.complianceMode, ...rules }) },
    ],
    tags,
  });
}

