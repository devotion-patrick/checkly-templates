import { PlaywrightCheck } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { KIND_VERSION } from './schema.ts';
import type { RestrictedAdminEntry } from './schema.ts';
import { buildCheckEnv } from './env.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_15M',
};

export function factory(entry: RestrictedAdminEntry, ctx: ProjectContext): PlaywrightCheck {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? 'EVERY_15M';
  const locations = resolveLocations(entry, ctx);

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry, templateVersion: KIND_VERSION }),
    ctx.project.tags,
    entry.tags,
  );

  // Points at the same playwright.config.ts / launch-readiness spec every
  // Playwright kind uses — see env.ts for why CHECK_KIND stays
  // "launch-readiness".
  const env = buildCheckEnv(entry);

  return new PlaywrightCheck(entry.logicalId, {
    name: buildCheckName(ctx.project, entry),
    playwrightConfigPath: './playwright.config.ts',
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    environmentVariables: [
      { key: 'CHECK_TARGET_URL', value: env.CHECK_TARGET_URL },
      { key: 'CHECK_KIND', value: env.CHECK_KIND },
      { key: 'CHECK_PARAMS', value: env.CHECK_PARAMS },
    ],
    tags,
  });
}
