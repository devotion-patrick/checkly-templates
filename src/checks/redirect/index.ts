import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, redirectSchemaFragment, type RedirectEntry } from './schema.ts';

export const redirectModule: KindModule<RedirectEntry> = {
  kind: KIND,
  schemaFragment: redirectSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
