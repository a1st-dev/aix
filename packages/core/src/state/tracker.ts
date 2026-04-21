import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'pathe';
import type { ConfigScope } from '@a1st/aix-schema';
import type { StateFile, StateSection, InstalledItemMeta, InstalledItems } from './types.js';

/**
 * Resolve the state file path for a given scope.
 * - project → `<projectRoot>/.aix/state.json`
 * - user    → `~/.aix/state.json`
 */
export function getStatePath(scope: ConfigScope, projectRoot?: string): string {
   if (scope === 'user') {
      return join(homedir(), '.aix', 'state.json');
   }
   const root = projectRoot ?? process.cwd();

   return join(root, '.aix', 'state.json');
}

function createEmptyState(scope: ConfigScope): StateFile {
   return {
      version: 1,
      scope,
      installed: {
         mcp: {},
         skills: {},
         rules: {},
         prompts: {},
      },
   };
}

/**
 * Read and parse the state file. Returns an empty state if the file does not exist.
 */
export async function readState(scope: ConfigScope, projectRoot?: string): Promise<StateFile> {
   const path = getStatePath(scope, projectRoot);

   if (!existsSync(path)) {
      return createEmptyState(scope);
   }
   try {
      const raw = await readFile(path, 'utf-8');

      return JSON.parse(raw) as StateFile;
   } catch {
      return createEmptyState(scope);
   }
}

/**
 * Write the state file, creating the parent directory if needed.
 */
export async function writeState(
   state: StateFile,
   scope: ConfigScope,
   projectRoot?: string,
): Promise<void> {
   const path = getStatePath(scope, projectRoot);

   await mkdir(dirname(path), { recursive: true });
   await writeFile(path, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

/**
 * Record that an item was installed. Creates or updates the entry.
 */
export async function trackInstall(
   scope: ConfigScope,
   section: StateSection,
   name: string,
   editors: string[],
   projectRoot?: string,
): Promise<void> {
   const state = await readState(scope, projectRoot),
         now = new Date().toISOString(),
         existing = state.installed[section][name];

   if (existing) {
      existing.updatedAt = now;
      existing.editors = [...new Set([...existing.editors, ...editors])];
   } else {
      state.installed[section][name] = {
         installedAt: now,
         updatedAt: now,
         editors,
      };
   }

   await writeState(state, scope, projectRoot);
}

/**
 * Record that an item was removed.
 */
export async function trackRemoval(
   scope: ConfigScope,
   section: StateSection,
   name: string,
   projectRoot?: string,
): Promise<void> {
   const state = await readState(scope, projectRoot);

   delete state.installed[section][name];
   await writeState(state, scope, projectRoot);
}

/**
 * Get all installed item names for a given section.
 */
export function getInstalledNames(state: StateFile, section: StateSection): string[] {
   return Object.keys(state.installed[section]);
}

/**
 * Get metadata for a specific installed item.
 */
export function getInstalledItem(
   state: StateFile,
   section: StateSection,
   name: string,
): InstalledItemMeta | undefined {
   return state.installed[section][name];
}

/**
 * Get all installed items for a section.
 */
export function getInstalledItems(state: StateFile, section: StateSection): InstalledItems {
   return state.installed[section];
}

/**
 * Detect items that were previously installed (in state) but are no longer present in the
 * current ai.json config. These represent manual removals that should trigger uninstall.
 */
export function detectRemovedItems(
   state: StateFile,
   section: StateSection,
   currentConfigNames: string[],
): string[] {
   const tracked = getInstalledNames(state, section),
         current = new Set(currentConfigNames);

   return tracked.filter((name) => !current.has(name));
}

/**
 * Detect items present in the ai.json config that are not yet tracked in state.
 * These represent newly added items that need to be installed.
 */
export function detectNewItems(
   state: StateFile,
   section: StateSection,
   currentConfigNames: string[],
): string[] {
   const tracked = new Set(getInstalledNames(state, section));

   return currentConfigNames.filter((name) => !tracked.has(name));
}

/**
 * Replace the entire installed set for a section. Useful after a full install pass.
 */
export async function syncSectionState(
   scope: ConfigScope,
   section: StateSection,
   names: string[],
   editors: string[],
   projectRoot?: string,
): Promise<void> {
   const state = await readState(scope, projectRoot),
         now = new Date().toISOString();

   const updated: InstalledItems = {};

   for (const name of names) {
      const existing = state.installed[section][name];

      updated[name] = existing
         ? { ...existing, updatedAt: now, editors: [...new Set([...existing.editors, ...editors])] }
         : { installedAt: now, updatedAt: now, editors };
   }
   state.installed[section] = updated;
   await writeState(state, scope, projectRoot);
}
