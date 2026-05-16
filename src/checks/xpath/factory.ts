import { ApiCheck, AssertionBuilder } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { type XpathEntry } from './schema.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_30M',
};

export function factory(entry: XpathEntry, ctx: ProjectContext): ApiCheck {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? "EVERY_15M";
  const locations = resolveLocations(entry, ctx);

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry }),
    ctx.project.tags,
    entry.tags,
  );

  const { contains = [], notContains = [] } = entry.expect;
  const bodyAssertions = [
    AssertionBuilder.statusCode().equals(200),
    ...contains.map((s) => AssertionBuilder.textBody().contains(s)),
    ...notContains.map((s) => AssertionBuilder.textBody().notContains(s)),
  ];

  return new ApiCheck(entry.logicalId, {
    name: `xpath: ${ctx.project.name} - ${entry.env} - ${entry.url}`,
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    tags,
    request: {
      method: 'GET',
      url: entry.url,
      followRedirects: true,
      assertions: bodyAssertions,
    },
  });
}
