import { Flags } from '@oclif/core';
import type { ConfigScope } from '@a1st/aix-schema';

// --- Section filter (formerly --scope, now --only) ---

export const VALID_SECTIONS = ['rules', 'prompts', 'mcp', 'skills', 'editors'] as const;
export type Section = (typeof VALID_SECTIONS)[number];

/**
 * Reusable --only flag for filtering commands by config section.
 * Replaces the old --scope flag (which now means user/project).
 */
export const onlyFlag = {
   only: Flags.string({
      description: 'Filter to specific config sections (repeatable)',
      multiple: true,
      options: [...VALID_SECTIONS],
   }),
};

/**
 * Parse and validate --only flags, returning all sections if none specified.
 */
export function parseSections(flags: { only?: string[] }): Section[] {
   if (!flags.only || flags.only.length === 0) {
      return [...VALID_SECTIONS];
   }
   return flags.only as Section[];
}

/**
 * Check if a section is included in the filter.
 */
export function includesSection(sections: Section[], section: Section): boolean {
   return sections.includes(section);
}

// --- Config scope (user vs project) ---

/**
 * Reusable flags for targeting user or project scope.
 * --scope user|project, --user/-u, --project/-p
 */
export const configScopeFlags = {
   scope: Flags.string({
      char: 's',
      description: 'Target scope for installation',
      options: ['user', 'project'],
   }),
   user: Flags.boolean({
      char: 'u',
      description: 'Target user scope (alias for --scope user)',
      default: false,
      exclusive: ['project'],
   }),
   project: Flags.boolean({
      char: 'p',
      description: 'Target project scope (alias for --scope project)',
      default: false,
      exclusive: ['user'],
   }),
};

/**
 * Resolve the target ConfigScope from the parsed flags.
 * Priority: --scope > --user/--project > defaultScope.
 */
export function resolveConfigScope(
   flags: { scope?: string; user?: boolean; project?: boolean },
   defaultScope?: ConfigScope,
): ConfigScope;
export function resolveConfigScope(
   flags: { scope?: string; user?: boolean; project?: boolean },
   defaultScope: undefined,
): ConfigScope | undefined;
export function resolveConfigScope(
   flags: { scope?: string; user?: boolean; project?: boolean },
   defaultScope?: ConfigScope | undefined,
): ConfigScope | undefined {
   // Use 'user' as default only when argument is not passed at all
   const resolvedDefault = arguments.length < 2 ? ('user' as ConfigScope) : defaultScope;

   if (flags.scope) {
      return flags.scope as ConfigScope;
   }
   if (flags.user) {
      return 'user';
   }
   if (flags.project) {
      return 'project';
   }
   return resolvedDefault;
}

// --- Backward compatibility aliases ---

/** @deprecated Use `onlyFlag` instead. */
export const scopeFlag = onlyFlag;
/** @deprecated Use `Section` instead. */
export type Scope = Section;
/** @deprecated Use `VALID_SECTIONS` instead. */
export const VALID_SCOPES = VALID_SECTIONS;
/** @deprecated Use `parseSections` instead. */
export const parseScopes = parseSections;
/** @deprecated Use `includesSection` instead. */
export const includesScope = includesSection;
