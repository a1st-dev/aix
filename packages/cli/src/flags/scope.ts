import { Flags } from '@oclif/core';

export const VALID_SCOPES = ['rules', 'prompts', 'mcp', 'skills', 'editors'] as const;
export type Scope = (typeof VALID_SCOPES)[number];

/**
 * Reusable --scope flag for filtering commands by field. Can be specified multiple times:
 * --scope rules --scope mcp
 */
export const scopeFlag = {
   scope: Flags.string({
      char: 's',
      description: 'Filter to specific fields (repeatable)',
      multiple: true,
      options: [...VALID_SCOPES],
   }),
};

/**
 * Parse and validate scope flags, returning all scopes if none specified
 */
export function parseScopes(flags: { scope?: string[] }): Scope[] {
   if (!flags.scope || flags.scope.length === 0) {
      return [...VALID_SCOPES];
   }
   return flags.scope as Scope[];
}

/**
 * Check if a scope is included in the filter
 */
export function includesScope(scopes: Scope[], scope: Scope): boolean {
   return scopes.includes(scope);
}
