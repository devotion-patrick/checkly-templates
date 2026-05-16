import type { CommonEntryFields, ProjectBlock } from './types.ts';

export const SOURCE_TAG_VALUE = 'checkly-templates';

export interface BuildAutoTagsInput {
  project: ProjectBlock;
  entry: Pick<CommonEntryFields, 'kind' | 'env'>;
}

// Emits the canonical tag set for a check. `source:checkly-templates` is
// always present (with the prefix if one is configured) so the Checkly UI
// can identify checks managed by this repo at a glance. The
// app/env/kind triple is only emitted when both `tagPrefix` and
// `codename` are set, because the triple is meaningful only inside a
// consumer's tagging namespace.
export function buildAutoTags({ project, entry }: BuildAutoTagsInput): string[] {
  const prefix = project.tagPrefix?.trim();
  const sourceTag = prefix
    ? `${prefix}.source:${SOURCE_TAG_VALUE}`
    : `source:${SOURCE_TAG_VALUE}`;

  const tags: string[] = [sourceTag];

  if (prefix && project.codename) {
    tags.push(
      `${prefix}.app:${project.codename}`,
      `${prefix}.env:${entry.env}`,
      `${prefix}.kind:${entry.kind}`,
    );
  } else if (prefix) {
    tags.push(`${prefix}.env:${entry.env}`, `${prefix}.kind:${entry.kind}`);
  }

  return tags;
}

// De-duplicating union of an arbitrary number of tag lists. Preserves
// first-seen order so the auto-emitted tags lead.
export function mergeTags(...lists: ReadonlyArray<readonly string[] | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const t of list) {
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}
