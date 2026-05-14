import type { EditorRule } from '../../types.js';
import { extractFrontmatter } from '../../../frontmatter-utils.js';

export function formatPlainMarkdownRule(rule: EditorRule, headingPrefix: '#' | '##'): string {
   const content = stripRuleFrontmatter(rule.content),
         lines: string[] = [],
         contentStartsWithHeading = /^#\s/.test(content.trim());

   if (rule.name && !contentStartsWithHeading) {
      lines.push(`${headingPrefix} ${rule.name}`, '');
   }

   lines.push(content);
   return lines.join('\n');
}

function stripRuleFrontmatter(content: string): string {
   const parsed = extractFrontmatter(content.trim());

   return parsed.hasFrontmatter ? parsed.content : content;
}
