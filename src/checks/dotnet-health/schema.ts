import { commonEntryProperties, smokeOrMonitorConstraint } from '@checkly-templates/shared/entry-schema';
import type { CommonEntryFields } from '@checkly-templates/shared/types';

export const KIND = 'dotnet-health' as const;

export interface DotnetHealthEntry extends CommonEntryFields {
  kind: typeof KIND;
  // Appended to `url`. Default "/health".
  healthPath?: string;
  // Each must report status === "Healthy" in the response JSON's
  // results object (the ASP.NET Core HealthCheck contract).
  expectedComponents?: string[];
  // Acceptable value for $.status. Default "Healthy".
  expectedOverallStatus?: string;
}

export const dotnetHealthSchemaFragment = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'logicalId', 'env', 'url'],
  properties: {
    ...commonEntryProperties,
    kind: { const: KIND },
    healthPath: {
      type: 'string',
      default: '/health',
      description: 'Path appended to url. Default "/health".',
      pattern: '^/.*',
    },
    expectedComponents: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      description: 'Named components whose status must report Healthy. Maps to `$.results.<name>.status`.',
    },
    expectedOverallStatus: {
      type: 'string',
      default: 'Healthy',
      description: 'Value $.status must equal.',
    },
  },
  allOf: [smokeOrMonitorConstraint],
} as const;
