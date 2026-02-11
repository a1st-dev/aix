import type { MergedRules, MergedRule } from './merger.js';

/**
 * Format rules for output in various formats
 */
export function formatRulesForEditor(rules: MergedRule[], format: 'markdown' | 'text' | 'json'): string {
   const contents = rules.map((r) => r.content);

   switch (format) {
      case 'markdown':
         return contents.map((rule, i) => `${i + 1}. ${rule}`).join('\n\n');

      case 'text':
         return contents.join('\n\n---\n\n');

      case 'json':
         return JSON.stringify(contents, null, 2);

      default:
         return contents.join('\n\n');
   }
}

/**
 * Validate rule content for common issues
 */
export function validateRuleContent(content: string): {
   valid: boolean;
   warnings: string[];
} {
   const warnings: string[] = [];

   if (content.length > 10000) {
      warnings.push('Rule content exceeds 10,000 characters');
   }

   if (content.includes('{{') && !content.includes('}}')) {
      warnings.push('Unclosed variable interpolation');
   }

   if (content.trim().length === 0) {
      warnings.push('Rule content is empty');
   }

   return {
      valid: warnings.length === 0,
      warnings,
   };
}

/**
 * Deduplicate rules by normalized content
 */
export function deduplicateRules(rules: MergedRule[]): MergedRule[] {
   const seen = new Set<string>();

   return rules.filter((rule) => {
      const normalized = rule.content.trim().toLowerCase();

      if (seen.has(normalized)) {
         return false;
      }
      seen.add(normalized);
      return true;
   });
}

/**
 * Get a summary of merged rules for debugging
 */
export function getRulesSummary(merged: MergedRules): {
   total: number;
   byScope: Record<string, number>;
   byActivation: Record<string, number>;
} {
   const byScope: Record<string, number> = {},
         byActivation: Record<string, number> = {};

   for (const rule of merged.all) {
      byScope[rule.scope] = (byScope[rule.scope] ?? 0) + 1;
      byActivation[rule.metadata.activation] = (byActivation[rule.metadata.activation] ?? 0) + 1;
   }

   return {
      total: merged.all.length,
      byScope,
      byActivation,
   };
}

/**
 * Filter rules by scope
 */
export function filterByScope(rules: MergedRule[], scope: MergedRule['scope']): MergedRule[] {
   return rules.filter((r) => r.scope === scope);
}

/**
 * Get manual rules that can be @mentioned
 */
export function getMentionableRules(merged: MergedRules): { name: string; description?: string }[] {
   return merged.manual
      .filter((r) => r.name)
      .map((r) => ({
         name: r.name,
         description: r.metadata.description,
      }));
}
