import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, KIND_VERSION, customApiSchemaFragment, type CustomApiEntry } from './schema.ts';

export const customApiModule: KindModule<CustomApiEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  schemaFragment: customApiSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
