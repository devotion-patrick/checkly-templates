import { PlaywrightCheck } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { KIND_VERSION } from './schema.ts';
import type { GdprEntry } from './schema.ts';
import { buildCheckEnv } from './env.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_24H',
};

/**
 * One check per location, each with CHECK_LOCATION set. A single check run
 * in parallel shares one env, so it can't tell which location it is in.
 */
export function factory(entry: GdprEntry, ctx: ProjectContext): PlaywrightCheck[] {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? "EVERY_15M";
  const locations = resolveLocations(entry, ctx);

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry, templateVersion: KIND_VERSION }),
    ctx.project.tags,
    entry.tags,
  );

  const name = buildCheckName(ctx.project, entry);

  // Always suffixed, so adding a location later doesn't rename the first.
  return locations.map((location) => {
    const env = buildCheckEnv(entry, location);

    return new PlaywrightCheck(`${entry.logicalId}-${location}`, {
      name: `${name} (${location})`,
      playwrightConfigPath: './playwright.config.ts',
      frequency: parseFrequency(frequencyName),
      locations: [location] as never[],
      activated: entry.activated ?? true,
      environmentVariables: [
        { key: 'CHECK_TARGET_URL', value: env.CHECK_TARGET_URL },
        { key: 'CHECK_KIND', value: env.CHECK_KIND },
        { key: 'CHECK_PARAMS', value: env.CHECK_PARAMS },
        { key: 'CHECK_LOCATION', value: location },
      ],
      tags,
    });
  });
}

