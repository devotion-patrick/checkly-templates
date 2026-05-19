import { PlaywrightCheck } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { KIND, type XpathSpaEntry } from './schema.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_1H',
};

export function factory(entry: XpathSpaEntry, ctx: ProjectContext): PlaywrightCheck {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? "EVERY_15M";
  const locations = resolveLocations(entry, ctx);

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry }),
    ctx.project.tags,
    entry.tags,
  );

  return new PlaywrightCheck(entry.logicalId, {
    name: buildCheckName(ctx.project, entry),
    playwrightConfigPath: './playwright.config.ts',
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    environmentVariables: [
      { key: 'CHECK_TARGET_URL', value: entry.url },
      { key: 'CHECK_KIND', value: KIND },
      {
        key: 'CHECK_PARAMS',
        value: JSON.stringify({
          waitUntil: entry.waitUntil ?? 'domcontentloaded',
          selectors: entry.expect,
        }),
      },
    ],
    tags,
  });
}
