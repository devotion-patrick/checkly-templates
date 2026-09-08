import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, KIND_VERSION, restrictedAdminSchemaFragment, type RestrictedAdminEntry } from './schema.ts';

export const restrictedAdminModule: KindModule<RestrictedAdminEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  schemaFragment: restrictedAdminSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
  isPlaywright: true,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
