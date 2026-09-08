import { MultiStepCheck } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { KIND_VERSION, type CustomMultistepEntry } from './schema.ts';

export const defaults: KindDefaults = {
  // Hourly, not every 15 minutes: the same reasoning custom-playwright's
  // default carries. A multistep check is lighter than a browser check --
  // no browser to instantiate -- but a fully consumer-authored script still
  // has no bound on how much work or how many outbound requests one run
  // makes (see the dealer-list-sites example in this kind's README).
  frequency: 'EVERY_1H',
};

export function factory(entry: CustomMultistepEntry, ctx: ProjectContext): MultiStepCheck {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? 'EVERY_15M';
  const locations = resolveLocations(entry, ctx);

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry, templateVersion: KIND_VERSION }),
    ctx.project.tags,
    entry.tags,
  );

  return new MultiStepCheck(entry.logicalId, {
    name: buildCheckName(ctx.project, entry),
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    tags,

    // The one piece of context a fully consumer-authored script cannot know
    // for itself: which address this check was defined against. Set from
    // `url` (already `path`-combined by the time a portal-authored config
    // reaches here), not hardcoded into the script.
    environmentVariables: [
      { key: 'CHECK_TARGET_URL', value: entry.url },
    ],

    code: { content: entry.script },
  });
}
