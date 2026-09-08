// Shared request-header resolution for ApiCheck kinds that accept a
// `headers` list where each entry sets either a literal `value` or a
// `valueFromEnv` (a process env var read at DEPLOY time, stashed as a
// per-check Checkly env var so the secret stays scoped to this
// construct — not account-global — and the header value gets rewritten
// to `{{ENV_NAME}}` so Checkly resolves it server-side at run time).
// Used by dotnet-health and custom-api; see dotnet-health's README for
// the full secret-plumbing walkthrough (Key Vault -> CI variable -> here).

export interface HeaderSpec {
  key: string;
  value?: string;
  valueFromEnv?: string;
}

export interface ResolvedHeaders {
  headers: Array<{ key: string; value: string }>;
  environmentVariables: Array<{ key: string; value: string }>;
}

export function resolveHeaders(
  logicalId: string,
  headers: HeaderSpec[] | undefined,
  defaultHeaders: Array<{ key: string; value: string }> = [],
): ResolvedHeaders {
  const resolvedHeaders = [...defaultHeaders];
  const environmentVariables: Array<{ key: string; value: string }> = [];

  for (const h of headers ?? []) {
    if (h.valueFromEnv) {
      const v = process.env[h.valueFromEnv];
      if (v === undefined || v === '') {
        throw new Error(
          `Check "${logicalId}" header "${h.key}" sources its value from env var ` +
            `"${h.valueFromEnv}", but that variable is not set in the deploy environment. ` +
            `Add it to your CI's secret store (ADO variable group, GHA secret, etc.) so it's ` +
            `available to the pipeline step running \`checkly deploy\`.`,
        );
      }
      environmentVariables.push({ key: h.valueFromEnv, value: v });
      resolvedHeaders.push({ key: h.key, value: `{{${h.valueFromEnv}}}` });
    } else if (h.value !== undefined) {
      resolvedHeaders.push({ key: h.key, value: h.value });
    }
    // Schema-side `oneOf` guarantees exactly one of value / valueFromEnv;
    // no third branch needed.
  }

  return { headers: resolvedHeaders, environmentVariables };
}
