import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, uptimeSslSchemaFragment, type UptimeSslEntry } from './schema.ts';

export const uptimeSslModule: KindModule<UptimeSslEntry> = {
  kind: KIND,
  schemaFragment: uptimeSslSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
