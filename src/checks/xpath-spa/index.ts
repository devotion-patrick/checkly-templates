import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, KIND_VERSION, xpathSpaSchemaFragment, type XpathSpaEntry } from './schema.ts';

export const xpathSpaModule: KindModule<XpathSpaEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  schemaFragment: xpathSpaSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
  isPlaywright: true,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
