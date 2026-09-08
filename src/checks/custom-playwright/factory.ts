import { BrowserCheck, RetryStrategyBuilder } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { KIND_VERSION, type CustomPlaywrightEntry } from './schema.ts';

export const defaults: KindDefaults = {
  // Hourly, not every 15 minutes: the same reasoning xpath-spa's default
  // carries -- a browser check bills per run in every region it uses, and
  // unlike custom-api's teardown script, a fully consumer-authored
  // Playwright script has no bound on how much work one run can do (see
  // the dealer-list-sites example in this kind's README, which makes
  // dozens of its own outbound requests per run).
  frequency: 'EVERY_1H',
};

export function factory(entry: CustomPlaywrightEntry, ctx: ProjectContext): BrowserCheck {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? 'EVERY_15M';
  const locations = resolveLocations(entry, ctx);

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry, templateVersion: KIND_VERSION }),
    ctx.project.tags,
    entry.tags,
  );

  return new BrowserCheck(entry.logicalId, {
    name: buildCheckName(ctx.project, entry),
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    retryStrategy: RetryStrategyBuilder.noRetries(),
    tags,

    // The one piece of context a fully consumer-authored script cannot know
    // for itself: which address this check was defined against. Set from
    // `url` (already `path`-combined by the time a portal-authored config
    // reaches here), not hardcoded into the script, the same reasoning as
    // custom-api reading `check.Url` rather than the script naming its own
    // address.
    environmentVariables: [
      { key: 'CHECK_TARGET_URL', value: entry.url },
    ],

    code: { content: entry.script },
  });
}
