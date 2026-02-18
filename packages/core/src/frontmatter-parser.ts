/**
 * Auto-detecting frontmatter parser that uses editor-specific strategies to parse frontmatter.
 * Uses ordered priority for detection: Windsurf → Cursor → Claude Code → GitHub Copilot.
 */

import type { ActivationMode } from '@a1st/aix-schema';
import type { ParsedRuleFrontmatter, ParsedPromptFrontmatter, RulesStrategy, PromptsStrategy } from './editors/strategies/types.js';
import { WindsurfRulesStrategy } from './editors/strategies/windsurf/rules.js';
import { WindsurfPromptsStrategy } from './editors/strategies/windsurf/prompts.js';
import { CursorRulesStrategy } from './editors/strategies/cursor/rules.js';
import { ClaudeCodeRulesStrategy } from './editors/strategies/claude-code/rules.js';
import { ClaudeCodePromptsStrategy } from './editors/strategies/claude-code/prompts.js';
import { CopilotPromptsStrategy } from './editors/strategies/copilot/prompts.js';
import { CodexPromptsStrategy } from './editors/strategies/codex/prompts.js';
import { extractFrontmatter, parseYamlValue } from './frontmatter-utils.js';

/** Ordered list of rules strategies for auto-detection (priority order) */
const RULES_STRATEGIES: RulesStrategy[] = [
   new WindsurfRulesStrategy(),
   new CursorRulesStrategy(),
   new ClaudeCodeRulesStrategy(),
];

/** Ordered list of prompts strategies for auto-detection (priority order) */
const PROMPTS_STRATEGIES: PromptsStrategy[] = [
   new WindsurfPromptsStrategy(),
   new ClaudeCodePromptsStrategy(),
   new CopilotPromptsStrategy(),
   new CodexPromptsStrategy(),
];

/**
 * Parse rule frontmatter using auto-detection. Tries each strategy in priority order and uses the
 * first one that detects its format. Falls back to generic parsing if no strategy matches.
 *
 * @param rawContent - Raw markdown content potentially containing front-matter
 * @param strategy - Optional specific strategy to use (skips auto-detection)
 * @returns Parsed frontmatter with unified metadata
 */
export function parseRuleFrontmatter(
   rawContent: string,
   strategy?: RulesStrategy,
): ParsedRuleFrontmatter {
   // Use provided strategy if given
   if (strategy?.parseFrontmatter) {
      return strategy.parseFrontmatter(rawContent);
   }

   // Try auto-detection with priority order
   for (const strat of RULES_STRATEGIES) {
      if (strat.detectFormat?.(rawContent)) {
         return strat.parseFrontmatter!(rawContent);
      }
   }

   // Fall back to generic parsing
   return parseGenericRuleFrontmatter(rawContent);
}

/**
 * Parse prompt frontmatter using auto-detection. Tries each strategy in priority order and uses
 * the first one that detects its format. Falls back to generic parsing if no strategy matches.
 *
 * @param rawContent - Raw markdown content potentially containing front-matter
 * @param strategy - Optional specific strategy to use (skips auto-detection)
 * @returns Parsed frontmatter with unified fields
 */
export function parsePromptFrontmatter(
   rawContent: string,
   strategy?: PromptsStrategy,
): ParsedPromptFrontmatter {
   // Use provided strategy if given
   if (strategy?.parseFrontmatter) {
      return strategy.parseFrontmatter(rawContent);
   }

   // Try auto-detection with priority order
   for (const strat of PROMPTS_STRATEGIES) {
      if (strat.detectFormat?.(rawContent)) {
         return strat.parseFrontmatter!(rawContent);
      }
   }

   // Fall back to generic parsing
   return parseGenericPromptFrontmatter(rawContent);
}

/**
 * Generic rule frontmatter parsing that handles common fields across editors.
 * Used as fallback when no editor-specific format is detected.
 */
function parseGenericRuleFrontmatter(rawContent: string): ParsedRuleFrontmatter {
   const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

   if (!hasFrontmatter) {
      return { content: rawContent, metadata: {} };
   }

   const lines = frontmatter.split('\n'),
         description = parseYamlValue(lines, 'description') as string | undefined,
         globs = parseYamlValue(lines, 'globs'),
         paths = parseYamlValue(lines, 'paths'),
         trigger = parseYamlValue(lines, 'trigger') as string | undefined,
         alwaysApply = parseYamlValue(lines, 'alwaysApply') as boolean | undefined;

   // Parse globs from various sources
   let globsArray: string[] | undefined;

   if (typeof globs === 'string') {
      globsArray = globs.split(',').map((g) => g.trim());
   } else if (Array.isArray(globs)) {
      globsArray = globs;
   } else if (Array.isArray(paths)) {
      globsArray = paths;
   }

   // Determine activation mode from various editor formats
   let activation: ActivationMode | undefined;

   // Windsurf trigger values
   const triggerToActivation: Record<string, ActivationMode> = {
      always_on: 'always',
      model_decision: 'auto',
      glob: 'glob',
      manual: 'manual',
   };

   if (trigger && triggerToActivation[trigger]) {
      activation = triggerToActivation[trigger];
   } else if (alwaysApply === true) {
      activation = 'always';
   } else if (globsArray && globsArray.length > 0) {
      activation = 'glob';
   } else if (alwaysApply === false) {
      activation = description ? 'auto' : 'manual';
   }

   return {
      content,
      metadata: {
         activation,
         description,
         globs: globsArray,
      },
   };
}

/**
 * Generic prompt frontmatter parsing that handles common fields across editors.
 * Used as fallback when no editor-specific format is detected.
 */
function parseGenericPromptFrontmatter(rawContent: string): ParsedPromptFrontmatter {
   const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

   if (!hasFrontmatter) {
      return { content: rawContent };
   }

   const lines = frontmatter.split('\n'),
         description = parseYamlValue(lines, 'description') as string | undefined,
         argumentHint = parseYamlValue(lines, 'argument-hint') as string | undefined;

   return {
      content,
      description,
      argumentHint,
   };
}
