import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, KIND_VERSION, customPlaywrightSchemaFragment, type CustomPlaywrightEntry } from './schema.ts';

export const customPlaywrightModule: KindModule<CustomPlaywrightEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  schemaFragment: customPlaywrightSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
  isPlaywright: true,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
