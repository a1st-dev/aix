import type { McpServerConfig } from '@a1st/aix-schema';

/**
 * Deep equality check for two values. Used to determine if configs "substantially differ".
 */
export function deepEqual(a: unknown, b: unknown): boolean {
   if (a === b) {
      return true;
   }

   if (a === null || b === null) {
      return false;
   }

   if (typeof a !== typeof b) {
      return false;
   }

   if (typeof a !== 'object') {
      return false;
   }

   if (Array.isArray(a) !== Array.isArray(b)) {
      return false;
   }

   if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
         return false;
      }
      return a.every((item, index) => deepEqual(item, b[index]));
   }

   const aObj = a as Record<string, unknown>,
         bObj = b as Record<string, unknown>,
         aKeys = Object.keys(aObj),
         bKeys = Object.keys(bObj);

   if (aKeys.length !== bKeys.length) {
      return false;
   }

   return aKeys.every((key) => Object.hasOwn(bObj, key) && deepEqual(aObj[key], bObj[key]));
}

/**
 * Compare two MCP server configs to determine if they substantially differ.
 * Returns true if configs are equivalent (no substantial difference).
 */
export function mcpConfigsMatch(local: McpServerConfig, existing: McpServerConfig): boolean {
   return deepEqual(local, existing);
}

/**
 * Normalize whitespace for prompt comparison.
 */
function normalizeWhitespace(s: string): string {
   return s.trim().replace(/\r\n/g, '\n');
}

/**
 * Compare two prompt contents to determine if they substantially differ.
 * Returns true if prompts are equivalent (no substantial difference).
 */
export function promptsMatch(local: string, existing: string): boolean {
   return normalizeWhitespace(local) === normalizeWhitespace(existing);
}
