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
