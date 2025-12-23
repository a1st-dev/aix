/**
 * Strategy for how to handle a merge conflict at a specific key.
 * - `merge`: Recursively merge objects, replace primitives/arrays (default behavior)
 * - `replace`: Use the new value entirely, don't recurse into objects
 * - `keep`: Keep the old value, ignore the new value
 */
export type MergeStrategy = 'merge' | 'replace' | 'keep';

/**
 * Context provided to the merge resolver function.
 */
export interface MergeContext {
   /** The current key being merged */
   key: string;
   /** The path of keys leading to this value (not including current key) */
   path: string[];
   /** The existing value (may be undefined if key doesn't exist in base) */
   oldValue: unknown;
   /** The incoming value to merge */
   newValue: unknown;
}

/**
 * Function that determines the merge strategy for a specific key. Return undefined to use default
 * behavior (merge objects, replace primitives/arrays).
 */
export type MergeResolver = (context: MergeContext) => MergeStrategy | undefined;

/**
 * Options for deepMergeJson.
 */
export interface DeepMergeOptions {
   /** Custom resolver to determine merge strategy per-key */
   resolver?: MergeResolver;
}

/**
 * Deep merge two JSON objects. By default:
 * - Objects are recursively merged
 * - Arrays and primitives are replaced (new value wins)
 *
 * Use the `resolver` option to customize merge behavior per-key.
 *
 * @example
 * ```ts
 * // Default behavior
 * deepMergeJson({ a: { x: 1 } }, { a: { y: 2 } })
 * // => { a: { x: 1, y: 2 } }
 *
 * // With custom resolver - replace entire object at specific path
 * deepMergeJson(base, override, {
 *   resolver: ({ path }) => path[0] === 'servers' ? 'replace' : undefined
 * })
 * ```
 */
export function deepMergeJson(
   base: Record<string, unknown>,
   override: Record<string, unknown>,
   options: DeepMergeOptions = {},
): Record<string, unknown> {
   return mergeRecursive(base, override, [], options.resolver);
}

function mergeRecursive(
   base: Record<string, unknown>,
   override: Record<string, unknown>,
   path: string[],
   resolver?: MergeResolver,
): Record<string, unknown> {
   const result = { ...base };

   for (const [key, newValue] of Object.entries(override)) {
      const oldValue = result[key],
            context: MergeContext = { key, path, oldValue, newValue },
            strategy = resolver?.(context) ?? getDefaultStrategy(oldValue, newValue);

      switch (strategy) {
      case 'keep':
         // Keep old value, do nothing
         break;

      case 'replace':
         // Replace entirely with new value
         result[key] = newValue;
         break;

      case 'merge':
      default:
         // Default merge behavior
         if (isPlainObject(newValue)) {
            if (isPlainObject(oldValue)) {
               result[key] = mergeRecursive(
                  oldValue as Record<string, unknown>,
                  newValue as Record<string, unknown>,
                  [...path, key],
                  resolver,
               );
            } else {
               result[key] = newValue;
            }
         } else {
            result[key] = newValue;
         }
         break;
      }
   }

   return result;
}

/**
 * Determine the default merge strategy based on value types.
 */
function getDefaultStrategy(oldValue: unknown, newValue: unknown): MergeStrategy {
   // If both are objects, merge them
   if (isPlainObject(oldValue) && isPlainObject(newValue)) {
      return 'merge';
   }
   // Otherwise replace (arrays, primitives, type mismatches)
   return 'replace';
}

/**
 * Check if a value is a plain object (not null, not array).
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
   return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Create a merge resolver that replaces values at specific paths. Paths are matched by joining with
 * dots, e.g., `['mcpServers', '*']` matches any key under `mcpServers`.
 *
 * @example
 * ```ts
 * // Replace entire MCP server objects instead of merging them
 * const resolver = createPathResolver({
 *   'mcpServers.*': 'replace',
 *   'context_servers.*': 'replace',
 * });
 * ```
 */
export function createPathResolver(rules: Record<string, MergeStrategy>): MergeResolver {
   return ({ key, path }) => {
      const fullPath = [...path, key].join('.');

      // Check for exact match first
      if (rules[fullPath]) {
         return rules[fullPath];
      }

      // Check for wildcard matches (e.g., 'mcpServers.*')
      for (const [pattern, strategy] of Object.entries(rules)) {
         if (matchesPattern(fullPath, pattern)) {
            return strategy;
         }
      }

      return undefined;
   };
}

/**
 * Match a path against a pattern with wildcard support.
 * - `*` matches any single segment
 * - `**` matches any number of segments (not implemented yet)
 */
function matchesPattern(path: string, pattern: string): boolean {
   const pathParts = path.split('.'),
         patternParts = pattern.split('.');

   if (pathParts.length !== patternParts.length) {
      return false;
   }

   return patternParts.every((part, i) => part === '*' || part === pathParts[i]);
}

/**
 * Pre-built merge resolver for MCP config files. Replaces entire server objects instead of merging
 * them, since a server definition from aix should completely override any existing definition with
 * the same name.
 *
 * Works with both standard MCP format (`mcpServers.*`) and Zed format (`context_servers.*`).
 */
export const mcpConfigMergeResolver: MergeResolver = createPathResolver({
   'mcpServers.*': 'replace',
   'context_servers.*': 'replace',
});
