export { loadRule, loadRules, type LoadedRule } from './loader.js';
export {
   mergeRules,
   getActiveRules,
   type MergedRule,
   type MergedRules,
   type MergeOptions,
   type RuleScope,
} from './merger.js';
export {
   interpolateRule,
   interpolateRules,
   hasUnresolvedVariables,
   extractVariableNames,
   type InterpolationContext,
} from './interpolate.js';
export { loadSkillRules, loadAllSkillRules } from './skill-rules.js';
export {
   formatRulesForEditor,
   validateRuleContent,
   deduplicateRules,
   getRulesSummary,
   filterByScope,
   getMentionableRules,
} from './utils.js';
