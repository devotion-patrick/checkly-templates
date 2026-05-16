import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, xpathSpaSchemaFragment, type XpathSpaEntry } from './schema.ts';

export const xpathSpaModule: KindModule<XpathSpaEntry> = {
  kind: KIND,
  schemaFragment: xpathSpaSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
  isPlaywright: true,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
