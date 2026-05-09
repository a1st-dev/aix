import type { ConfigScope } from '@a1st/aix-schema';

/**
 * The section types that can be tracked in state.
 */
export type StateSection = 'mcp' | 'skills' | 'rules' | 'prompts' | 'agents';

/**
 * Metadata for a single installed item.
 */
export interface InstalledItemMeta {
   /** ISO 8601 timestamp of when the item was first installed */
   installedAt: string;
   /** ISO 8601 timestamp of most recent install/update */
   updatedAt: string;
   /** Editor names the item was installed to */
   editors: string[];
}

/**
 * A record of installed items keyed by name.
 */
export type InstalledItems = Record<string, InstalledItemMeta>;

/**
 * Root structure of the state JSON file (.aix/state.json).
 */
export interface StateFile {
   /** State file format version */
   version: 1;
   /** Scope this state file tracks */
   scope: ConfigScope;
   /** Installed items by section */
   installed: {
      mcp: InstalledItems;
      skills: InstalledItems;
      rules: InstalledItems;
      prompts: InstalledItems;
      agents: InstalledItems;
   };
}
