import fs from 'node:fs';
import path from 'node:path';
// ajv + ajv-formats publish CJS default exports. With NodeNext + esModuleInterop
// the runtime gives us a callable / constructable value but TS sees the
// namespace shape, so we cast once at the import site.
import AjvImport from 'ajv';
import addFormatsImport from 'ajv-formats';
const Ajv = AjvImport as unknown as new (opts?: object) => {
  compile: (schema: unknown) => (data: unknown) => boolean;
};
const addFormats = addFormatsImport as unknown as (ajv: object) => void;
import type { ProjectContext } from '@checkly-templates/shared/types';
import { buildSchema } from './schema-builder.ts';
import type { ConsumerConfig } from './types.ts';

export const CONFIG_ENV = 'CHECKLY_TEMPLATES_CONFIG';

function readConfigSource(): { source: string; raw: string } {
  const fromEnv = process.env[CONFIG_ENV];
  if (!fromEnv) {
    throw new Error(
      `${CONFIG_ENV} is not set. Point it at your unified config (e.g. ` +
        `${CONFIG_ENV}=./.checkly/checks.json) before invoking the Checkly CLI.`,
    );
  }
  const abs = path.resolve(process.cwd(), fromEnv);
  if (!fs.existsSync(abs)) {
    throw new Error(`${CONFIG_ENV}="${fromEnv}" resolved to "${abs}" but no file exists there.`);
  }
  return { source: abs, raw: fs.readFileSync(abs, 'utf8') };
}

let cached: ConsumerConfig | null = null;

// Test-only: forget the cached config so the next loadConsumerConfig()
// call re-reads from disk. Production runs go through one config load
// per Checkly CLI invocation, so this hook is a no-op in production.
export function _resetConfigCacheForTests(): void {
  cached = null;
}

export function loadConsumerConfig(): ConsumerConfig {
  if (cached) return cached;

  const { source, raw } = readConfigSource();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON from ${source}: ${(err as Error).message}`);
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(buildSchema()) as ((data: unknown) => boolean) & {
    errors?: Array<{ instancePath?: string; message?: string }>;
  };
  if (!validate(parsed)) {
    const errs = (validate.errors ?? [])
      .map((e) => `  - ${e.instancePath || '<root>'}: ${e.message}`)
      .join('\n');
    throw new Error(`${source} failed schema validation:\n${errs}`);
  }

  cached = parsed as ConsumerConfig;
  return cached;
}

export function buildContext(config: ConsumerConfig): ProjectContext {
  return {
    project: config.project,
    // Pass through whatever the consumer set on `project.defaults` — or
    // leave undefined so kind-level defaults take effect. The precedence
    // each factory walks is: entry → project → kind → hardcoded fallback.
    defaultFrequency: config.project.defaults?.frequency,
    defaultLocations: config.project.defaults?.locations,
  };
}
