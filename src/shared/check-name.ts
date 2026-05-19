import type { CommonEntryFields, ProjectBlock } from './types.ts';

// Composes the human-readable Checkly check name. Format:
//
//   {codename|project.name} - {env} - {kind} - {url}
//
// Falls back to project.name when no codename is configured so the
// emitted name is always non-empty. Honours a per-entry `name` override
// when set so consumers can hand-tune individual check names without
// abandoning the rest of the auto-composition.
//
// `entry.env` MUST be populated by the time this is called — load-config
// resolves project.defaults.env into each entry before factories run.
export function buildCheckName(
  project: ProjectBlock,
  entry: Pick<CommonEntryFields, 'kind' | 'env' | 'url' | 'name'>,
): string {
  if (entry.name) return entry.name;
  const app = project.codename ?? project.name;
  return `${app} - ${entry.env} - ${entry.kind} - ${entry.url}`;
}
