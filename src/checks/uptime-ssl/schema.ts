import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'uptime-ssl' as const;

export interface UptimeSslEntry extends CommonEntryFields {
  kind: typeof KIND;
  // Days before TLS expiry to start alerting. Default 30.
  sslCertificateExpiryThresholdDays?: number;
  // Acceptable success status range. Default: 200-299.
  successStatusRange?: { min: number; max: number };
}

export const uptimeSslSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'env', 'url'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    sslCertificateExpiryThresholdDays: {
      type: 'integer',
      minimum: 1,
      maximum: 365,
      default: 30,
      description: 'Alert when the TLS cert is within this many days of expiry.',
    },
    successStatusRange: {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max'],
      properties: {
        min: { type: 'integer', minimum: 100, maximum: 599 },
        max: { type: 'integer', minimum: 100, maximum: 599 },
      },
      description: 'Inclusive status-code range counted as success. Defaults to 200-299.',
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
