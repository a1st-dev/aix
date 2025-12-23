import { describe, it, expect } from 'vitest';
import {
   formatRulesForEditor,
   validateRuleContent,
   deduplicateRules,
   getRulesSummary,
   getMentionableRules,
} from '../../rules/utils.js';
import type { MergedRule, MergedRules } from '../../rules/merger.js';

function createMergedRule(overrides: Partial<MergedRule> = {}): MergedRule {
   return {
      name: 'test-rule',
      content: 'Test rule content',
      source: 'inline',
      scope: 'project',
      metadata: { activation: 'always' },
      ...overrides,
   };
}

describe('formatRulesForEditor', () => {
   const rules = [createMergedRule({ content: 'Rule one' }), createMergedRule({ content: 'Rule two' })];

   it('formats as markdown', () => {
      const result = formatRulesForEditor(rules, 'markdown');

      expect(result).toBe('1. Rule one\n\n2. Rule two');
   });

   it('formats as text', () => {
      const result = formatRulesForEditor(rules, 'text');

      expect(result).toBe('Rule one\n\n---\n\nRule two');
   });

   it('formats as json', () => {
      const result = formatRulesForEditor(rules, 'json');

      expect(JSON.parse(result)).toEqual(['Rule one', 'Rule two']);
   });
});

describe('validateRuleContent', () => {
   it('returns valid for normal content', () => {
      const result = validateRuleContent('Use TypeScript strict mode');

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
   });

   it('warns for very long content', () => {
      const longContent = 'x'.repeat(10001);
      const result = validateRuleContent(longContent);

      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('Rule content exceeds 10,000 characters');
   });

   it('warns for unclosed variable interpolation', () => {
      const result = validateRuleContent('Use {{project.name without closing');

      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('Unclosed variable interpolation');
   });

   it('warns for empty content', () => {
      const result = validateRuleContent('   ');

      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('Rule content is empty');
   });
});

describe('deduplicateRules', () => {
   it('removes duplicate rules', () => {
      const rules = [
         createMergedRule({ content: 'Use TypeScript' }),
         createMergedRule({ content: 'Use TypeScript' }),
         createMergedRule({ content: 'Different rule' }),
      ];

      const result = deduplicateRules(rules);

      expect(result).toHaveLength(2);
   });

   it('is case-insensitive', () => {
      const rules = [
         createMergedRule({ content: 'Use TypeScript' }),
         createMergedRule({ content: 'use typescript' }),
      ];

      const result = deduplicateRules(rules);

      expect(result).toHaveLength(1);
   });
});

describe('getRulesSummary', () => {
   it('summarizes rules by scope and activation', () => {
      const merged: MergedRules = {
         all: [
            createMergedRule({ scope: 'project', metadata: { activation: 'always' } }),
            createMergedRule({ scope: 'project', metadata: { activation: 'auto' } }),
            createMergedRule({ scope: 'skill', metadata: { activation: 'always' } }),
         ],
         always: [],
         auto: [],
         glob: [],
         manual: [],
      };

      const summary = getRulesSummary(merged);

      expect(summary.total).toBe(3);
      expect(summary.byScope).toEqual({ project: 2, skill: 1 });
      expect(summary.byActivation).toEqual({ always: 2, auto: 1 });
   });
});

describe('getMentionableRules', () => {
   it('returns manual rules with names', () => {
      const merged: MergedRules = {
         all: [],
         always: [],
         auto: [],
         glob: [],
         manual: [
            createMergedRule({
               name: 'refactoring',
               metadata: { activation: 'manual', description: 'Refactoring guide' },
            }),
            createMergedRule({
               name: 'testing',
               metadata: { activation: 'manual' },
            }),
         ],
      };

      const result = getMentionableRules(merged);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'refactoring', description: 'Refactoring guide' });
      expect(result[1]).toEqual({ name: 'testing', description: undefined });
   });

   it('excludes manual rules without names', () => {
      const merged: MergedRules = {
         all: [],
         always: [],
         auto: [],
         glob: [],
         manual: [createMergedRule({ name: '', metadata: { activation: 'manual' } })],
      };

      const result = getMentionableRules(merged);

      expect(result).toHaveLength(0);
   });
});
