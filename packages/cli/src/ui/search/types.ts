import type { SearchResult, SearchType } from '../../lib/search/types.js';

export interface SearchUIProps {
   initialQuery?: string;
   types: SearchType[];
   registry: {
      searchSkills: (options: { query: string }) => Promise<SearchResult[]>;
      searchMcp: (options: { query: string }) => Promise<SearchResult[]>;
   };
   /** Called when user installs a single item. */
   onInstall: (item: InstallItem) => Promise<ActionOutcome>;
   /** Called when user uninstalls a single item. */
   onUninstall?: (item: InstallItem) => Promise<ActionOutcome>;
   /** Called when search exits. Receives list of items installed during session. */
   onExit: (installedItems: InstallItem[]) => void;
   /** Items already installed (from ai.json) */
   alreadyInstalled?: Set<string>;
}

export interface InstallItem {
   result: SearchResult;
   type: SearchType;
}

/** What an install or uninstall did. `error` is shown to the user when it did not succeed. */
export interface ActionOutcome {
   success: boolean;
   error?: string;
}
