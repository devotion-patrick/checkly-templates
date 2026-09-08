import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'custom-playwright' as const;
// Bumped whenever this kind's factory/schema logic changes in a way
// that matters to an already-deployed check -- i.e. pushing the same
// consumer config again would produce a materially different construct.
// Emitted as a `tmpl-version:<kind>@<version>` tag on every check (see
// @checkly-templates/shared/tags).
export const KIND_VERSION = '1.0.0';

export interface CustomPlaywrightEntry extends CommonEntryFields {
  kind: typeof KIND;
  // A path appended to `url` before this check runs, e.g.
  // "/CMSPages/Devotion/HealthCheck/DealerList.ashx". Portal-only plumbing,
  // the same field and the same reasoning as custom-api's `path`: `url`
  // (from CommonEntryFields) is already the full absolute address a
  // consumer of this schema sets directly, and this exists only because
  // the Devotion portal's own configuration derives `url` from an
  // application's hostname rather than letting a consumer type one. A
  // consumer that already sets `url` itself -- this repo's own deploy
  // pipeline included -- has no use for it.
  path?: string;
  // The entire Playwright test script, run as this check's `code.content`
  // (see https://www.checklyhq.com/docs/constructs/browser-check/). No
  // embedded spec and no CHECK_PARAMS contract the way the other browser
  // kinds here have -- this kind exists for a shape too particular for a
  // reusable spec, the browser-check counterpart to custom-api's `script`:
  // the script owns 100% of what the check does and asserts, there is
  // nothing else this kind adds on top of a plain Checkly BrowserCheck.
  // `page`, `context`, `request` (Playwright's APIRequestContext) and
  // `process.env` (including `CHECK_TARGET_URL`, set from this entry's own
  // resolved `url`) are available the way any Checkly BrowserCheck script
  // has them.
  script: string;
}

export const customPlaywrightSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'url', 'script'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    path: {
      type: 'string',
      description:
        'Appended to `url` before this check runs. Portal-only plumbing, same field and reasoning as custom-api\'s `path`: a consumer that already sets `url` to the full address (this repo\'s own deploy pipeline included) has no use for this.',
    },
    script: {
      type: 'string',
      minLength: 1,
      description:
        'Full Playwright test script, run as this check\'s entire body via Checkly\'s BrowserCheck `code.content`. `page`, `context`, `request` and `process.env` (including CHECK_TARGET_URL) are available; there is no separate assertions field, the script is the whole check.',
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
