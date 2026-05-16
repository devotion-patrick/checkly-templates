import { ApiCheck, AssertionBuilder } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { type DotnetHealthEntry } from './schema.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_5M',
  locations: ['eu-central-1', 'ap-southeast-2'],
};

const DEFAULT_HEALTH_PATH = '/health';
const DEFAULT_OVERALL_STATUS = 'Healthy';

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return b + p;
}

export function factory(entry: DotnetHealthEntry, ctx: ProjectContext): ApiCheck {
  const frequencyName = entry.frequency ?? defaults.frequency ?? ctx.defaultFrequency;
  const locations = entry.locations ?? defaults.locations ?? ctx.defaultLocations;
  const healthPath = entry.healthPath ?? DEFAULT_HEALTH_PATH;
  const overall = entry.expectedOverallStatus ?? DEFAULT_OVERALL_STATUS;
  const targetUrl = joinUrl(entry.url, healthPath);

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry }),
    ctx.project.tags,
    entry.tags,
  );

  const assertions = [
    AssertionBuilder.statusCode().equals(200),
    AssertionBuilder.jsonBody('$.status').equals(overall),
    ...(entry.expectedComponents ?? []).map((name) =>
      AssertionBuilder.jsonBody(`$.results['${name}'].status`).equals(overall),
    ),
  ];

  return new ApiCheck(entry.logicalId, {
    name: `Health: ${ctx.project.name} - ${entry.env} - ${targetUrl}`,
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    tags,
    request: {
      method: 'GET',
      url: targetUrl,
      headers: [{ key: 'Accept', value: 'application/json' }],
      followRedirects: false,
      assertions,
    },
  });
}
