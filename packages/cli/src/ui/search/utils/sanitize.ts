/* eslint-disable no-control-regex */

/**
 * Sanitize text for safe terminal display.
 * Removes only truly problematic characters while preserving legitimate Unicode
 * (CJK, emojis, accented characters, etc.).
 */
export function sanitizeForTerminal(text: string | undefined | null): string {
   if (!text) {
      return '';
   }

   return (
      text
         // Remove ASCII control characters (except newline, tab, carriage return)
         .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
         // Remove zero-width characters and other invisible Unicode
         .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
         // Remove bidirectional text control characters (can break layout)
         .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
         // Remove other problematic Unicode categories:
         // - Variation selectors
         .replace(/[\uFE00-\uFE0F]/g, '')
         // - Interlinear annotation anchors
         .replace(/[\uFFF9-\uFFFC]/g, '')
         // Normalize whitespace (but keep single newlines)
         .replace(/[ \t]+/g, ' ')
         .replace(/\n+/g, '\n')
         // Trim whitespace
         .trim()
   );
}

/**
 * Alias for sanitizeForTerminal - both now use the same permissive approach.
 */
export const sanitizeDescription = sanitizeForTerminal;
