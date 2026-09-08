import { ApiCheck } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import { resolveHeaders } from '@checkly-templates/shared/headers';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { KIND_VERSION, type CustomApiEntry } from './schema.ts';

export const defaults: KindDefaults = {
  frequency: 'EVERY_15M',
};

export function factory(entry: CustomApiEntry, ctx: ProjectContext): ApiCheck {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? 'EVERY_15M';
  const locations = resolveLocations(entry, ctx);

  const tags = mergeTags(
    buildAutoTags({ project: ctx.project, entry, templateVersion: KIND_VERSION }),
    ctx.project.tags,
    entry.tags,
  );

  const { headers, environmentVariables } = resolveHeaders(entry.logicalId, entry.headers);

  return new ApiCheck(entry.logicalId, {
    name: buildCheckName(ctx.project, entry),
    frequency: parseFrequency(frequencyName),
    locations: locations as never[],
    activated: entry.activated ?? true,
    tags,
    environmentVariables: environmentVariables.length > 0 ? environmentVariables : undefined,
    request: {
      method: entry.method ?? 'GET',
      url: entry.url,
      headers,
      body: entry.body,
      followRedirects: false,
    },
    // The entire validation lives in the consumer-authored script — no
    // declarative assertions. It runs after the request completes with
    // `response`/`request`/`process.env` in scope (see schema.ts's
    // `script` field doc and Checkly's setup/teardown docs); throwing
    // fails the check, console.log is for non-blocking notes.
    tearDownScript: { content: entry.script },
  });
}
