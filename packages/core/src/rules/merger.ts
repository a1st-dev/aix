import type { LoadedRule } from './loader.js';
import type { RulesConfig } from '@a1st/aix-schema';
import { loadRules } from './loader.js';

export type RuleScope = 'skill' | 'project' | 'editor';

export interface MergedRule extends LoadedRule {
   scope: RuleScope;
}

export interface MergedRules {
   /** All rules (for debugging/inspection) */
   all: MergedRule[];
   /** Rules to always include */
   always: MergedRule[];
   /** Rules for AI to decide (with descriptions) */
   auto: MergedRule[];
   /** Rules matching current file globs */
   glob: MergedRule[];
   /** Manual rules (available for @mention) */
   manual: MergedRule[];
}

export interface MergeOptions {
   /** Current file path (for glob matching) */
   targetPath?: string;
   /** Editor-specific rules from editors.[editor].rules */
   editorRules?: RulesConfig;
   /** Whether to include skill rules (default: true) */
   includeSkillRules?: boolean;
   /** Path to ai.json */
   basePath: string;
}

/**
 * Simple glob-like pattern matching
 */
function matchPattern(value: string, pattern: string): boolean {
   // Normalize path separators
   const normalizedValue = value.replace(/\\/g, '/'),
         normalizedPattern = pattern.replace(/\\/g, '/');

   // Convert glob to regex step by step
   let regexPattern = '';
   let i = 0;

   while (i < normalizedPattern.length) {
      const char = normalizedPattern[i] as string;

      if (char === '*') {
         if (normalizedPattern[i + 1] === '*') {
            // ** - match anything including /
            if (normalizedPattern[i + 2] === '/') {
               regexPattern += '(?:.*/)?'; // **/ matches zero or more directories
               i += 3;
            } else {
               regexPattern += '.*'; // ** matches anything
               i += 2;
            }
         } else {
            // * - match anything except /
            regexPattern += '[^/]*';
            i++;
         }
      } else if (char === '?') {
         regexPattern += '.';
         i++;
      } else if ('.+^${}()|[]\\'.includes(char)) {
         regexPattern += '\\' + char;
         i++;
      } else {
         regexPattern += char;
         i++;
      }
   }

   return new RegExp(`^${regexPattern}$`).test(normalizedValue);
}

/**
 * Check if a file matches any of the glob patterns
 */
function matchesGlobs(filePath: string, globs: string[]): boolean {
   return globs.some((glob) => matchPattern(filePath, glob));
}

/**
 * Merge rules from multiple sources in correct order
 */
export async function mergeRules(
   config: RulesConfig,
   skillRules: LoadedRule[],
   options: MergeOptions,
): Promise<MergedRules> {
   const allRules: MergedRule[] = [];

   // 1. Add skill rules first (lowest priority)
   if (options.includeSkillRules !== false) {
      allRules.push(...skillRules.map((r) => Object.assign(r, { scope: 'skill' as const })));
   }

   // 2. Add project rules (the main use case)
   if (config && Object.keys(config).length > 0) {
      const projectRulesRecord = await loadRules(config, options.basePath);
      const projectRules = Object.values(projectRulesRecord);

      allRules.push(...projectRules.map((r) => Object.assign(r, { scope: 'project' as const })));
   }

   // 3. Add editor-specific rules (from editors.[editor].rules)
   if (options.editorRules && Object.keys(options.editorRules).length > 0) {
      const editorRulesRecord = await loadRules(options.editorRules, options.basePath);
      const editorRules = Object.values(editorRulesRecord);

      allRules.push(...editorRules.map((r) => Object.assign(r, { scope: 'editor' as const })));
   }

   // Categorize by activation mode
   const always = allRules.filter((r) => r.metadata.activation === 'always'),
         auto = allRules.filter((r) => r.metadata.activation === 'auto'),
         manual = allRules.filter((r) => r.metadata.activation === 'manual');

   // For glob rules, filter by current file if provided
   const glob = allRules.filter((r) => {
      if (r.metadata.activation !== 'glob') {
         return false;
      }
      if (!options.targetPath || !r.metadata.globs) {
         return false;
      }
      return matchesGlobs(options.targetPath, r.metadata.globs);
   });

   return { all: allRules, always, auto, glob, manual };
}

/**
 * Get active rules for a specific file (always + matching globs + auto)
 */
export function getActiveRules(merged: MergedRules): MergedRule[] {
   return [...merged.always, ...merged.glob, ...merged.auto];
}
