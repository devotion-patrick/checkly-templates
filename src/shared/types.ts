export type FrequencyName =
  | 'EVERY_10S'
  | 'EVERY_30S'
  | 'EVERY_1M'
  | 'EVERY_2M'
  | 'EVERY_5M'
  | 'EVERY_10M'
  | 'EVERY_15M'
  | 'EVERY_30M'
  | 'EVERY_1H'
  | 'EVERY_6H'
  | 'EVERY_12H'
  | 'EVERY_24H';

export interface ProjectBlock {
  logicalId: string;
  name: string;
  codename?: string;
  tagPrefix?: string;
  tags?: string[];
  defaults?: {
    env?: string;
    frequency?: FrequencyName;
    locations?: string[];
  };
}

export interface CommonEntryFields {
  kind: string;
  logicalId: string;
  // Optional at the consumer-config level; load-config resolves it from
  // `project.defaults.env` if omitted. By the time factories see an
  // entry the field is always populated.
  env?: string;
  url: string;
  // Optional per-entry override for the auto-composed Checkly check
  // name. When unset, factories emit `{codename|project.name} - {env} - {kind} - {url}`.
  name?: string;
  tags?: string[];
  activated?: boolean;
  frequency?: FrequencyName;
  locations?: string[];
  // At least one of these must be true; enforced at schema level.
  smoke?: boolean;
  monitor?: boolean;
}

export type CheckPurpose = 'test' | 'monitor';

export interface ProjectContext {
  project: ProjectBlock;
  // Undefined when the consumer config didn't set `project.defaults.*`.
  // Factories fall through to their kind-level defaults in that case.
  // `defaultEnv` is consumed by load-config to resolve entry.env before
  // the factory runs, not by factories directly.
  defaultEnv?: string;
  defaultFrequency?: FrequencyName;
  defaultLocations?: string[];
}
