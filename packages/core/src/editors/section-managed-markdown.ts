/**
 * Section-managed markdown utility. Provides functions to manage a delimited section within
 * markdown files (like AGENTS.md and GEMINI.md) without overwriting user-maintained content.
 *
 * The managed section is wrapped in HTML comment markers:
 * ```
 * <!-- BEGIN AIX MANAGED SECTION — DO NOT EDIT -->
 * ... aix-generated content ...
 * <!-- END AIX MANAGED SECTION -->
 * ```
 */

export const AIX_SECTION_BEGIN = '<!-- BEGIN AIX MANAGED SECTION — DO NOT EDIT -->';
export const AIX_SECTION_END = '<!-- END AIX MANAGED SECTION -->';

/**
 * Insert or update the aix managed section in a markdown file. Preserves all content outside
 * the section markers.
 *
 * - If `existingContent` is null/empty: returns just the managed section with markers.
 * - If markers exist: replaces only the content between them.
 * - If no markers: appends the managed section at the end of the file.
 *
 * @param existingContent - The current file content, or null if the file doesn't exist.
 * @param managedContent - The new content to place inside the managed section. If empty,
 *   the managed section (including markers) is removed entirely.
 * @returns The updated file content.
 */
export function upsertManagedSection(existingContent: string | null, managedContent: string): string {
   // If managed content is empty, remove the managed section entirely
   if (!managedContent.trim()) {
      if (!existingContent) {
         return '';
      }
      return removeManagedSection(existingContent);
   }

   const section = formatManagedSection(managedContent);

   // No existing file — just the managed section
   if (!existingContent || !existingContent.trim()) {
      return section + '\n';
   }

   const beginIdx = existingContent.indexOf(AIX_SECTION_BEGIN),
         endIdx = existingContent.indexOf(AIX_SECTION_END);

   // Markers exist — replace content between them
   if (beginIdx !== -1 && endIdx !== -1) {
      const before = existingContent.slice(0, beginIdx),
            after = existingContent.slice(endIdx + AIX_SECTION_END.length);

      // Trim trailing newlines from before, add one blank line before section
      const trimmedBefore = before.replace(/\n*$/, '');
      // Trim leading newlines from after, add one blank line after section
      const trimmedAfter = after.replace(/^\n*/, '');

      const parts: string[] = [];

      if (trimmedBefore) {
         parts.push(trimmedBefore, '');
      }
      parts.push(section);
      if (trimmedAfter) {
         parts.push('', trimmedAfter);
      } else {
         parts.push('');
      }

      return parts.join('\n');
   }

   // No markers — append managed section at end
   const trimmed = existingContent.replace(/\n*$/, '');

   return trimmed + '\n\n' + section + '\n';
}

/**
 * Extract the managed section content from a markdown file. Returns the content between the
 * section markers, or null if no managed section exists.
 */
export function extractManagedSection(content: string): string | null {
   const beginIdx = content.indexOf(AIX_SECTION_BEGIN),
         endIdx = content.indexOf(AIX_SECTION_END);

   if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
      return null;
   }

   return content.slice(beginIdx + AIX_SECTION_BEGIN.length, endIdx).trim();
}

/**
 * Format the managed section with markers.
 */
function formatManagedSection(content: string): string {
   return `${AIX_SECTION_BEGIN}\n${content}\n${AIX_SECTION_END}`;
}

/**
 * Remove the managed section (including markers) from content.
 */
function removeManagedSection(content: string): string {
   const beginIdx = content.indexOf(AIX_SECTION_BEGIN),
         endIdx = content.indexOf(AIX_SECTION_END);

   if (beginIdx === -1 || endIdx === -1) {
      return content;
   }

   const before = content.slice(0, beginIdx).replace(/\n*$/, ''),
         after = content.slice(endIdx + AIX_SECTION_END.length).replace(/^\n*/, '');

   if (!before && !after) {
      return '';
   }

   const parts = [before, after].filter(Boolean);

   return parts.join('\n\n') + '\n';
}
