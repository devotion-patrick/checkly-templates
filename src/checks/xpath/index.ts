import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, KIND_VERSION, xpathSchemaFragment, type XpathEntry } from './schema.ts';

export const xpathModule: KindModule<XpathEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  schemaFragment: xpathSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
