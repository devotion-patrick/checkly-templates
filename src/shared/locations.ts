import type { CommonEntryFields, ProjectContext } from './types.ts';

// Resolves the locations a check should run from, with strict precedence:
//   1. entry.locations              (per-check override)
//   2. ctx.defaultLocations         (project.defaults.locations)
//
// Kinds do NOT contribute defaults here. Per-kind location defaults are
// surprising — a consumer who sets project.defaults.locations expects it
// to apply to every check, not be silently overridden when a kind has
// its own opinion about regions. If neither level sets locations, we
// throw a clear error pointing the consumer at the two valid places to
// put it. This is intentionally stricter than the frequency resolver:
// where the check runs is a deployment decision the consumer must own.
//
// Returns a fresh array each call so the caller can hand it to Checkly's
// construct without leaking a reference to either entry or ctx state.
export function resolveLocations(
  entry: Pick<CommonEntryFields, 'logicalId' | 'kind' | 'locations'>,
  ctx: ProjectContext,
): string[] {
  const fromEntry = entry.locations;
  const fromProject = ctx.defaultLocations;
  const chosen = fromEntry ?? fromProject;
  if (!chosen || chosen.length === 0) {
    throw new Error(
      `Check "${entry.logicalId}" (kind: ${entry.kind}) has no locations set. ` +
        `Set "locations" on the entry itself, OR set "project.defaults.locations" ` +
        `to apply a default to every check in this project. ` +
        `Example: "defaults": { "locations": ["ap-southeast-2"] }.`,
    );
  }
  return [...chosen];
}
