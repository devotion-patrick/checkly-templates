import { PlaywrightCheck } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { ccpaCa } from '@checkly-templates/shared';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { KIND_VERSION, type CcpaEntry } from './schema.ts';
import { buildCheckEnv } from './env.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_24H',
};

/**
 * One check per location, as gdpr. Locations come from the entry only and must be in
 * California: a project default (often EU or APAC) would test the wrong behaviour.
 */
export function factory(entry: CcpaEntry, ctx: ProjectContext): PlaywrightCheck[] {
  const allowed = [...ccpaCa.californiaChecklyLocations];
  const locations = entry.locations ?? [];

  if (locations.length === 0) {
    throw new Error(
      `Check "${entry.logicalId}" (kind: ccpa) has no locations set. Set "locations" on the entry to a ` +
        `California location (${allowed.join(', ')}); project defaults are not used for this kind.`,
    );
  }

  const outside = locations.filter((l) => !allowed.includes(l));
  if (outside.length > 0) {
    throw new Error(
      `Check "${entry.logicalId}" (kind: ccpa) has non-California locations: ${outside.join(', ')}. ` +
        `Use ${allowed.join(', ')}: sites only show their CCPA behaviour to California visitors.`,
    );
  }

  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? 'EVERY_24H';
  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry, templateVersion: KIND_VERSION }),
    ctx.project.tags,
    entry.tags,
  );
  const name = buildCheckName(ctx.project, entry);

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
