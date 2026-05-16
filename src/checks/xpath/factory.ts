import { ApiCheck, AssertionBuilder } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { type XpathEntry } from './schema.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_30M',
  locations: ['eu-central-1'],
};

export function factory(entry: XpathEntry, ctx: ProjectContext): ApiCheck {
  const frequencyName = entry.frequency ?? defaults.frequency ?? ctx.defaultFrequency;
  const locations = entry.locations ?? defaults.locations ?? ctx.defaultLocations;

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
