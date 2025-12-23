import type { SearchResult, SearchType } from '../../lib/search/types.js';

export interface SearchUIProps {
   initialQuery?: string;
   types: SearchType[];
   registry: {
      searchSkills: (options: { query: string }) => Promise<SearchResult[]>;
      searchMcp: (options: { query: string }) => Promise<SearchResult[]>;
   };
   /** Called when user installs a single item. Returns true on success. */
   onInstall: (item: InstallItem) => Promise<boolean>;
   /** Called when user uninstalls a single item. Returns true on success. */
   onUninstall?: (item: InstallItem) => Promise<boolean>;
   /** Called when search exits. Receives list of items installed during session. */
   onExit: (installedItems: InstallItem[]) => void;
   /** Items already installed (from ai.json) */
   alreadyInstalled?: Set<string>;
}

export interface InstallItem {
   result: SearchResult;
   type: SearchType;
}

/** @deprecated Use InstallItem instead */
export type SelectedItem = InstallItem;

export interface SearchState {
   query: string;
   results: SearchResult[];
   loading: boolean;
   error: string | null;
   selectedIndex: number;
   installedItems: Set<string>;
   activeTab: SearchType;
}
