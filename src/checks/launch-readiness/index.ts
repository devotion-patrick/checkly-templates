import type { KindModule } from '../../deploy/types.ts';
import { defaults, factory } from './factory.ts';
import { KIND, launchReadinessSchemaFragment, type LaunchReadinessEntry } from './schema.ts';

export const launchReadinessModule: KindModule<LaunchReadinessEntry> = {
  kind: KIND,
  schemaFragment: launchReadinessSchemaFragment as unknown as Record<string, unknown>,
  defaults,
  factory,
  isPlaywright: true,
};

export * from './schema.ts';
export { factory, defaults } from './factory.ts';
