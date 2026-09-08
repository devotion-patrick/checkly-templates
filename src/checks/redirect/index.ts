import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, KIND_VERSION, redirectSchemaFragment, type RedirectEntry } from './schema.ts';

export const redirectModule: KindModule<RedirectEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  schemaFragment: redirectSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
