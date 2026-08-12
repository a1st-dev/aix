/**
 * Read a `Record<string, string>` field (`env`, `headers`) from a parsed MCP config,
 * coercing values to strings. Returns undefined for missing or empty objects so callers
 * can omit the key entirely.
 */
export function parseStringRecord(value: unknown): Record<string, string> | undefined {
   if (typeof value !== 'object' || value === null) {
      return undefined;
   }

   const entries = Object.entries(value);

   if (entries.length === 0) {
      return undefined;
   }

   return Object.fromEntries(entries.map(([ key, entry ]) => [ key, String(entry) ]));
}
