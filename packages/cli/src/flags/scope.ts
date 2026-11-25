import { Flags } from '@oclif/core';
import type { ConfigScope } from '@a1st/aix-schema';

// --- Section filter (formerly --scope, now --only) ---

export const VALID_SECTIONS = [
   'rules',
   'prompts',
   'mcp',
   'skills',
   'agents',
   'hooks',
   'plugins',
   'marketplaces',
   'editors',
] as const;
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
      description: 'Editor config scope to target',
      options: ['user', 'project'],
      exclusive: ['user', 'project'],
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
 * Whether the flags ask for user scope, before any config-derived default applies. Commands
 * use this to skip the project ai.json entirely for user-scope operations.
 */
export function isUserScopeRequested(flags: { scope?: string; user?: boolean }): boolean {
   return flags.user === true || flags.scope === 'user';
}

export type ListScope = ConfigScope | 'all';

export function resolveListScope(flags: {
   all?: boolean;
   scope?: string;
   user?: boolean;
   project?: boolean;
}): ListScope {
   if (flags.all) {
      return 'all';
   }

   return resolveTargetScope(flags);
}

interface ScopeFlags {
   scope?: string;
   user?: boolean;
   project?: boolean;
}

function isConfigScope(value: string | undefined): value is ConfigScope {
   return value === 'user' || value === 'project';
}

/** The scope the flags ask for, or nothing when none of them was passed. */
export function getFlagScope(flags: ScopeFlags): ConfigScope | undefined {
   if (isConfigScope(flags.scope)) {
      return flags.scope;
   }
   if (flags.user) {
      return 'user';
   }

   return flags.project ? 'project' : undefined;
}

/**
 * The scope a command reads or writes editor config at: a scope flag, then the `scope` the
 * loaded ai.json declares, then user scope. Every command resolves its scope here, so one
 * project gives the same answer whichever command runs.
 */
export function resolveTargetScope(flags: ScopeFlags, config?: { scope?: ConfigScope }): ConfigScope {
   return getFlagScope(flags) ?? config?.scope ?? 'user';
}
