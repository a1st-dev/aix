/**
 * Helper to detect whether a CLAUDE.md file is merely a legacy fallback linking or importing AGENTS.md.
 */

export const CLAUDE_FALLBACK_WARNING =
   'Found fallback CLAUDE.md linking to AGENTS.md. Claude Code now supports AGENTS.md natively; CLAUDE.md can be safely removed.';

/**
 * Detect if a CLAUDE.md file is merely a legacy fallback linking or importing AGENTS.md.
 * Returns true if the file contains an AGENTS.md pointer and has no other substantive instructions.
 */
export function isFallbackClaudeMd(content: string): boolean {
   // Remove HTML comments
   const cleaned = content.replace(/<!--[\s\S]*?-->/g, '').trim();

   if (!cleaned) {
      return false;
   }

   const lines = cleaned
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

   let hasAgentsMdPointer = false;

   for (const line of lines) {
      // Allow generic markdown headings like "# CLAUDE.md", "# Instructions", etc.
      if (/^#+\s+(claude(\.md)?|instructions|project instructions)\b/i.test(line)) {
         continue;
      }

      // Check for @AGENTS.md or @./AGENTS.md import
      if (/^@\.?\/?AGENTS\.md$/i.test(line)) {
         hasAgentsMdPointer = true;
         continue;
      }

      // Check for link or reference: "See AGENTS.md", "Read and apply [AGENTS.md](./AGENTS.md).", etc.
      if (/\bAGENTS\.md\b/i.test(line)) {
         const normalized = line
            .replace(/\[\s*AGENTS\.md\s*\]\([^)]*\)/gi, 'AGENTS.md')
            .replace(/[#*`_.,:;!()[\]/]/g, ' ')
            .trim()
            .toLowerCase();

         const words = normalized.split(/\s+/).filter(Boolean),
               allowedWords = new Set([
                  'agents',
                  'md',
                  'see',
                  'read',
                  'and',
                  'apply',
                  'refer',
                  'to',
                  'please',
                  'follow',
                  'check',
                  'use',
                  'for',
                  'instructions',
                  'project',
                  'guidelines',
                  'rules',
                  'in',
               ]);

         if (words.every((w) => allowedWords.has(w))) {
            hasAgentsMdPointer = true;
            continue;
         }
      }

      // Any other substantive line means this is not solely a fallback file
      return false;
   }

   return hasAgentsMdPointer;
}
