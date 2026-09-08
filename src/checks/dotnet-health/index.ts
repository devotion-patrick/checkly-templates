import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, KIND_VERSION, dotnetHealthSchemaFragment, type DotnetHealthEntry } from './schema.ts';

export const dotnetHealthModule: KindModule<DotnetHealthEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  schemaFragment: dotnetHealthSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
