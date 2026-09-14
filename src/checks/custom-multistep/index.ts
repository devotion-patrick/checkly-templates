import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, KIND_VERSION, customMultistepSchemaFragment, type CustomMultistepEntry } from './schema.ts';

export const customMultistepModule: KindModule<CustomMultistepEntry> = {
  kind: KIND,
  version: KIND_VERSION,
  checkType: "MULTI_STEP",
  schemaFragment: customMultistepSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
  isPlaywright: true,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
