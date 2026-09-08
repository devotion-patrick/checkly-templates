import type { CommonEntryFields, ProjectBlock } from './types.ts';

export const SOURCE_TAG_VALUE = 'checkly-templates';

export interface BuildAutoTagsInput {
  project: ProjectBlock;
  entry: Pick<CommonEntryFields, 'kind' | 'env'>;
  // The pushing kind's KIND_VERSION (see each kind's schema.ts). Emitted
  // as a bare `tmpl-version:<kind>@<version>` tag — unprefixed and
  // unconditional, like `source:checkly-templates` — so a check's
  // template version is always readable straight off the check (e.g. by
  // a UI comparing it against this repo's current registry version to
  // decide whether a newer template is available to push), regardless
  // of whether the consumer set a tagPrefix.
  templateVersion?: string;
}

// Emits the canonical tag set for a check. `source:checkly-templates` is
// always emitted bare (never prefixed) so the Checkly UI can identify
// every check managed by this repo at a glance, regardless of any
// consumer-specific tag namespace. The codename/env/kind triple is only
// emitted when both `tagPrefix` and `codename` are set, because the
// triple is meaningful only inside a consumer's tagging namespace.
export function buildAutoTags({ project, entry, templateVersion }: BuildAutoTagsInput): string[] {
  const prefix = project.tagPrefix?.trim();

  const tags: string[] = [`source:${SOURCE_TAG_VALUE}`];
  if (templateVersion) {
    tags.push(`tmpl-version:${entry.kind}@${templateVersion}`);
  }

  if (prefix && project.codename) {
    tags.push(
      `${prefix}.codename:${project.codename}`,
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
