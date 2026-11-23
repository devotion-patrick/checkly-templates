import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { ccpaSchemaFragment, KIND, KIND_VERSION, type CcpaEntry } from './schema.ts';

export const ccpaModule: KindModule<CcpaEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  checkType: 'PLAYWRIGHT',
  schemaFragment: ccpaSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
  isPlaywright: true,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
