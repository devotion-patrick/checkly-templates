import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, dotnetHealthSchemaFragment, type DotnetHealthEntry } from './schema.ts';

export const dotnetHealthModule: KindModule<DotnetHealthEntry> = {
  kind: KIND,
  schemaFragment: dotnetHealthSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
