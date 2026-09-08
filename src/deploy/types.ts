import type {
  CommonEntryFields,
  FrequencyName,
  ProjectBlock,
  ProjectContext,
} from '@checkly-templates/shared/types';

// JSON Schema is structural — we keep it untyped at the boundary so each
// kind module can describe its own arm without us defining a partial
// TS mirror that would drift.
export type JsonSchemaFragment = Record<string, unknown>;

export interface ConsumerConfig {
  $schema?: string;
  project: ProjectBlock;
  checks: CommonEntryFields[];
}

export interface KindDefaults {
  frequency?: FrequencyName;
  locations?: string[];
}

export interface KindModule<E extends CommonEntryFields = CommonEntryFields> {
  kind: string;
  // This kind's KIND_VERSION (see each kind's schema.ts) — the same
  // value the factory emits as a `tmpl-version:<kind>@<version>` tag on
  // every check it produces. Exposed here so a consumer of this
  // registry (e.g. a UI that pushes checks) can read "what's the latest
  // template version for this kind" without having to synthesize a
  // check first, and compare it against the tag on an already-deployed
  // one to decide whether a newer template is available to push.
  version: string;
  schemaFragment: JsonSchemaFragment;
  defaults: KindDefaults;
  // Side-effect: instantiates a Checkly construct that registers itself
  // with the active Checkly project. Returns the construct so the caller
  // can attach further wiring if needed; most callers ignore the return.
  factory: (entry: E, ctx: ProjectContext) => unknown;
  // Set true when the factory creates a PlaywrightCheck. Used by the
  // pipeline templates and the try-script to decide whether to install
  // Chromium before deploying.
  isPlaywright?: boolean;
}
