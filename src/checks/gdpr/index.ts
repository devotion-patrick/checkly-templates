import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { gdprSchemaFragment, KIND, KIND_VERSION, type GdprEntry } from './schema.ts';

export const gdprModule: KindModule<GdprEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  schemaFragment: gdprSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
  isPlaywright: true,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
