const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

export interface InterpolationContext {
   project: {
      name: string;
      version?: string;
      description?: string;
   };
   editor: string;
   env: Record<string, string | undefined>;
   custom: Record<string, unknown>;
}

/**
 * Get a value from an object by dot-separated path
 */
function getValueByPath(obj: unknown, path: string): unknown {
   const parts = path.split('.');
   let current = obj;

   for (const part of parts) {
      if (current === null || current === undefined) {
         return undefined;
      }
      current = (current as Record<string, unknown>)[part];
   }

   return current;
}

/**
 * Interpolate variables in rule content using {{variable.path}} syntax
 */
export function interpolateRule(content: string, context: InterpolationContext): string {
   return content.replace(VARIABLE_PATTERN, (match, path: string) => {
      const value = getValueByPath(context, path.trim());

      if (value === undefined) {
         console.warn(`Unknown variable in rule: ${path}`);
         return match;
      }
      return String(value);
   });
}

/**
 * Interpolate variables in multiple rules
 */
export function interpolateRules(rules: string[], context: InterpolationContext): string[] {
   return rules.map((rule) => interpolateRule(rule, context));
}

/**
 * Check if content has unresolved variables
 */
export function hasUnresolvedVariables(content: string): boolean {
   return VARIABLE_PATTERN.test(content);
}

/**
 * Extract all variable names from content
 */
export function extractVariableNames(content: string): string[] {
   const matches = content.matchAll(new RegExp(VARIABLE_PATTERN.source, 'g'));

   return [...matches].map((m) => m[1]).filter((name): name is string => name !== undefined);
}
