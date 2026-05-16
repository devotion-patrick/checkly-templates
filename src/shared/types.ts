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
    frequency?: FrequencyName;
    locations?: string[];
  };
}

export interface CommonEntryFields {
  kind: string;
  logicalId: string;
  env: string;
  url: string;
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
  defaultFrequency: FrequencyName;
  defaultLocations: string[];
}
