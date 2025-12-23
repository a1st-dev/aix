/**
 * Simple debounce utility for search API calls.
 * Ensures we don't hammer APIs with rapid successive requests.
 */

const lastCallTimes = new Map<string, number>();

/**
 * Debounce delay in milliseconds per source.
 */
const DEBOUNCE_MS = 300;

/**
 * Ensures a minimum delay between calls to the same source.
 * If called too quickly, waits until the debounce period has passed.
 *
 * @param sourceId - Unique identifier for the source being called
 * @returns Promise that resolves when it's safe to make the call
 */
export async function debounce(sourceId: string): Promise<void> {
   const now = Date.now(),
         lastCall = lastCallTimes.get(sourceId);

   if (lastCall !== undefined) {
      const elapsed = now - lastCall,
            remaining = DEBOUNCE_MS - elapsed;

      if (remaining > 0) {
         await new Promise((resolve) => setTimeout(resolve, remaining));
      }
   }

   lastCallTimes.set(sourceId, Date.now());
}

/**
 * Clear debounce state (useful for testing).
 */
export function clearDebounceState(): void {
   lastCallTimes.clear();
}
