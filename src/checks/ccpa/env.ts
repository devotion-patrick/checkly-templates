// Pure CHECK_* env builder, checkly-free so apps/playwright-runner can share it with factory.ts.

import { ccpaCa } from '@checkly-templates/shared';
import { KIND, type CcpaEntry, type CcpaOverrides, type CcpaRules } from './schema.ts';

function applyList(base: readonly string[], o: { add?: string[]; remove?: string[] } | undefined): string[] {
  let list = [...base];
  if (o?.remove?.length) list = list.filter((x) => !o.remove!.includes(x));
  if (o?.add?.length) list = [...new Set([...list, ...o.add])];
  return list;
}

export function resolveRules(overrides: CcpaOverrides | undefined): CcpaRules {
  const adCookieBlocklist: Record<string, string[]> = Object.fromEntries(
    Object.entries(ccpaCa.adCookieBlocklist).map(([k, v]) => [k, [...v]]),
  );
  for (const cat of overrides?.adCookieBlocklist?.remove ?? []) delete adCookieBlocklist[cat];
  for (const [cat, patterns] of Object.entries(overrides?.adCookieBlocklist?.add ?? {})) {
    adCookieBlocklist[cat] = [...patterns];
  }

  return {
    adTechDomains: applyList([...ccpaCa.adTechDomains], overrides?.adTechDomains),
    analyticsDomains: applyList([...ccpaCa.analyticsDomains], overrides?.analyticsDomains),
    adCookieBlocklist,
    optOutLinkPatterns: applyList(ccpaCa.optOutLinkPatterns, overrides?.optOutLinkPatterns),
    optOutSelectors: [...(overrides?.optOutSelectors ?? [])],
  };
}

export interface CheckEnv {
  CHECK_TARGET_URL: string;
  CHECK_KIND: string;
  CHECK_PARAMS: string;
  /** Checkly location the check is pinned to. Absent for local runs. */
  CHECK_LOCATION?: string;
}

export function buildCheckEnv(entry: CcpaEntry, location?: string): CheckEnv {
  return {
    CHECK_TARGET_URL: entry.url,
    CHECK_KIND: KIND,
    // checkLevel only when set, so CCPA_CHECK_LEVEL applies otherwise.
    CHECK_PARAMS: JSON.stringify({
      ...(entry.checkLevel ? { checkLevel: entry.checkLevel } : {}),
      ...resolveRules(entry.overrides),
    }),
    ...(location ? { CHECK_LOCATION: location } : {}),
  };
}
