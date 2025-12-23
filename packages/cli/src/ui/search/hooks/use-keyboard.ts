import { useInput } from 'ink';
import type { SearchResult, SearchType } from '../../../lib/search/types.js';

interface UseKeyboardOptions {
   installingItem: string | null;
   uninstallingItem: string | null;
   currentResults: SearchResult[];
   currentResult: SearchResult | null;
   isCurrentInstalled: boolean;
   isCurrentInstalling: boolean;
   isCurrentUninstalling: boolean;
   activeTab: SearchType;
   types: SearchType[];
   query: string;
   error: string | null;
   setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
   setActiveTab: React.Dispatch<React.SetStateAction<SearchType>>;
   setQuery: (query: string) => void;
   setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
   installItem: (result: SearchResult | null, type: SearchType) => Promise<void>;
   uninstallItem: (result: SearchResult | null, type: SearchType) => Promise<void>;
   retry: () => void;
   handleExit: () => void;
}

export function useKeyboard(options: UseKeyboardOptions): void {
   const {
      installingItem,
      uninstallingItem,
      currentResults,
      currentResult,
      isCurrentInstalled,
      isCurrentInstalling,
      isCurrentUninstalling,
      activeTab,
      types,
      query,
      error,
      setSelectedIndex,
      setActiveTab,
      setQuery,
      setShowHelp,
      installItem,
      uninstallItem,
      retry,
      handleExit,
   } = options;

   useInput((input, key) => {
      // Block input while installing or uninstalling
      if (installingItem || uninstallingItem) {
         return;
      }

      // Navigation
      if (key.downArrow || input === 'j') {
         setSelectedIndex((i) => Math.min(i + 1, currentResults.length - 1));
         return;
      }
      if (key.upArrow || input === 'k') {
         setSelectedIndex((i) => Math.max(i - 1, 0));
         return;
      }

      // Tab switching (only if multiple tabs)
      if (key.tab && types.length > 1) {
         const newTab = activeTab === 'skills' ? 'mcp' : 'skills';

         if (types.includes(newTab)) {
            setActiveTab(newTab);
            setSelectedIndex(0);
         }
         return;
      }

      // Install/uninstall current item with Space or Enter (only when there are results)
      if ((input === ' ' || key.return) && currentResult && currentResults.length > 0) {
         if (isCurrentInstalled && !isCurrentUninstalling) {
            uninstallItem(currentResult, activeTab);
         } else if (!isCurrentInstalled && !isCurrentInstalling) {
            installItem(currentResult, activeTab);
         }
         return;
      }

      // Retry
      if (input === 'r' && error) {
         retry();
         return;
      }

      // Help
      if (input === '?') {
         setShowHelp((h) => !h);
         return;
      }

      // Escape - clear query or exit
      if (key.escape) {
         if (query) {
            setQuery('');
         } else {
            handleExit();
         }
      }
   });
}
