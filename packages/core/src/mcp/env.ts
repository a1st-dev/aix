const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

export interface EnvResolutionOptions {
   env?: Record<string, string | undefined>;
   throwOnMissing?: boolean;
}

/**
 * Resolve ${VAR} syntax in a string value
 */
export function resolveEnvVars(value: string, options: EnvResolutionOptions = {}): string {
   const env = options.env ?? process.env,
         throwOnMissing = options.throwOnMissing ?? false;

   return value.replace(ENV_VAR_PATTERN, (match, varName: string) => {
      const resolved = env[varName];

      if (resolved === undefined) {
         if (throwOnMissing) {
            throw new Error(`Environment variable not found: ${varName}`);
         }
         return match;
      }
      return resolved;
   });
}

/**
 * Resolve ${VAR} syntax in all values of an object
 */
export function resolveEnvObject(
   obj: Record<string, string>,
   options: EnvResolutionOptions = {},
): Record<string, string> {
   return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, resolveEnvVars(value, options)]),
   );
}

/**
 * Check if a string contains unresolved ${VAR} references
 */
export function hasUnresolvedEnvVars(value: string): boolean {
   return ENV_VAR_PATTERN.test(value);
}

/**
 * Extract all ${VAR} variable names from a string
 */
export function extractEnvVarNames(value: string): string[] {
   const matches = value.matchAll(new RegExp(ENV_VAR_PATTERN.source, 'g'));

   return [...matches].map((m) => m[1]).filter((name): name is string => name !== undefined);
}

/**
 * Validate that all referenced env vars are defined
 */
export function validateEnvVars(
   value: string,
   env: Record<string, string | undefined> = process.env,
): { valid: boolean; missing: string[] } {
   const names = extractEnvVarNames(value),
         missing = names.filter((name) => env[name] === undefined);

   return {
      valid: missing.length === 0,
      missing,
   };
}
