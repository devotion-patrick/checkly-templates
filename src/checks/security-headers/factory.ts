import { MultiStepCheck, RetryStrategyBuilder } from 'checkly/constructs';
import { buildAutoTags, mergeTags } from '@checkly-templates/shared/tags';
import { buildCheckName } from '@checkly-templates/shared/check-name';
import { parseFrequency } from '@checkly-templates/shared/frequency';
import { resolveLocations } from '@checkly-templates/shared/locations';
import type { ProjectContext } from '@checkly-templates/shared/types';
import type { KindDefaults } from '../../deploy/types.ts';
import { DEFAULT_SECURITY_HEADERS, KIND_VERSION, type SecurityHeadersEntry } from './schema.ts';

export const defaults: KindDefaults = {
  // Daily, not every minute: missing security headers don't regress
  // between deploys the way uptime does, and this is a MultiStepCheck --
  // billed per request, unlike the UrlMonitor uptime-ssl split off from.
  frequency: 'EVERY_24H',
};

// A missing header is a finding, but a softer one: it leaves a
// degraded.json marker instead of throwing, so Checkly reports the run
// Degraded rather than Down. Checkly's own convention for this (the shape
// the official @checkly/playwright-helpers package's markCheckAsDegraded()
// writes) needs a scriptable, Playwright-based runtime -- confirmed
// against a live account (2026-09-14) that a hand-written file, with no
// dependency on that package, is honoured identically. A network-level
// failure (DNS, connection refused) still fails the check on its own,
// via request.get() throwing, independent of this script.
const SCRIPT = `
const { test } = require('@playwright/test');

test('security-headers', async ({ request }) => {
  const params = JSON.parse(process.env.SECURITY_HEADERS_PARAMS);
  const response = await request.get(process.env.CHECK_TARGET_URL);
  const headers = response.headers();
  const lowerKeys = Object.keys(headers).map((key) => key.toLowerCase());
  const missing = params.securityHeaders.filter((want) => !lowerKeys.includes(want.toLowerCase()));

  if (missing.length > 0) {
    console.log('security-headers: ' + missing.length + ' missing: ' + missing.join(', '));
    require('fs').writeFileSync('degraded.json', JSON.stringify({
      messages: missing.map((header) => 'Response header "' + header + '" is missing.'),
    }));
  }
});
`;

export function factory(entry: SecurityHeadersEntry, ctx: ProjectContext): MultiStepCheck {
  const frequencyName = entry.frequency ?? ctx.defaultFrequency ?? defaults.frequency ?? 'EVERY_15M';
  const locations = resolveLocations(entry, ctx);
  const securityHeaders = entry.securityHeaders ?? [...DEFAULT_SECURITY_HEADERS];

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
    retryStrategy: RetryStrategyBuilder.noRetries(),
    tags,
    environmentVariables: [
      { key: 'CHECK_TARGET_URL', value: entry.url },
      { key: 'SECURITY_HEADERS_PARAMS', value: JSON.stringify({ securityHeaders }) },
    ],
    code: { content: SCRIPT },
  });
}
