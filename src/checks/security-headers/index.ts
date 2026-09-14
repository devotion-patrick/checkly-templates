import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, KIND_VERSION, securityHeadersSchemaFragment, type SecurityHeadersEntry } from './schema.ts';

export const securityHeadersModule: KindModule<SecurityHeadersEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  schemaFragment: securityHeadersSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
  isPlaywright: true,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
