import { Frequency } from 'checkly/constructs';
import type { FrequencyName } from './types.ts';

const MAP: Record<FrequencyName, Frequency> = {
  EVERY_10S: Frequency.EVERY_10S,
  EVERY_30S: Frequency.EVERY_30S,
  EVERY_1M: Frequency.EVERY_1M,
  EVERY_2M: Frequency.EVERY_2M,
  EVERY_5M: Frequency.EVERY_5M,
  EVERY_10M: Frequency.EVERY_10M,
  EVERY_15M: Frequency.EVERY_15M,
  EVERY_30M: Frequency.EVERY_30M,
  EVERY_1H: Frequency.EVERY_1H,
  EVERY_6H: Frequency.EVERY_6H,
  EVERY_12H: Frequency.EVERY_12H,
  EVERY_24H: Frequency.EVERY_24H,
};

export const FREQUENCY_NAMES = Object.keys(MAP) as readonly FrequencyName[];

export function parseFrequency(name: FrequencyName): Frequency {
  const value = MAP[name];
  if (value === undefined) {
    throw new Error(
      `Unknown frequency "${name}". Allowed: ${FREQUENCY_NAMES.join(', ')}`,
    );
  }
  return value;
}
