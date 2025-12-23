import React, { useState, useCallback } from 'react';
import { Box, useApp, useStdout } from 'ink';
import { SearchInput } from './SearchInput.js';
import { ResultsList } from './ResultsList.js';
import { DetailsPanel } from './DetailsPanel.js';
import { StatusBar } from './StatusBar.js';
import { TabBar } from './TabBar.js';
import { useSearch } from '../hooks/use-search.js';
import { useKeyboard } from '../hooks/use-keyboard.js';
import { useInstall } from '../hooks/use-install.js';
import type { SearchUIProps } from '../types.js';
import type { SearchType } from '../../../lib/search/types.js';

const MIN_WIDTH_FOR_SPLIT = 80,
      MIN_WIDTH_FOR_DETAILS = 40,
      DEFAULT_COLUMNS = 80;

export function SearchApp({
   initialQuery = '',
   types,
   registry,
   onInstall,
   onUninstall,
   onExit,
   alreadyInstalled = new Set(),
}: SearchUIProps): React.ReactElement {
   const { exit } = useApp();
   const { stdout } = useStdout();
   const columns = stdout?.columns ?? DEFAULT_COLUMNS,
         isSplitLayout = columns >= MIN_WIDTH_FOR_SPLIT,
         showStackedDetails = !isSplitLayout && columns >= MIN_WIDTH_FOR_DETAILS;

   const { query, setQuery, results, loading, error, retry } = useSearch({
      searchSkills: registry.searchSkills,
      searchMcp: registry.searchMcp,
   });

   const [activeTab, setActiveTab] = useState<SearchType>(types[0] ?? 'skills'),
         [selectedIndex, setSelectedIndex] = useState(0),
         [showHelp, setShowHelp] = useState(false);

   const { installedItems, installingItem, uninstallingItem, installedRef, installItem, uninstallItem } = useInstall({
      alreadyInstalled,
      onInstall,
      onUninstall,
   });

   React.useEffect(() => {
      if (initialQuery) {
         setQuery(initialQuery);
      }
   }, [initialQuery, setQuery]);

   const currentResults = results[activeTab] ?? [],
         currentResult = currentResults[selectedIndex] ?? null,
         isCurrentInstalled = currentResult ? installedItems.has(currentResult.name) : false,
         isCurrentInstalling = currentResult ? installingItem === currentResult.name : false,
         isCurrentUninstalling = currentResult ? uninstallingItem === currentResult.name : false;

   const handleExit = useCallback(() => {
      onExit(installedRef.current);
      exit();
   }, [onExit, exit, installedRef]);

   useKeyboard({
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
   });

   const resultsWidth = isSplitLayout ? Math.floor(columns * 0.4) : columns,
         detailsWidth = isSplitLayout ? columns - resultsWidth - 2 : columns,
         hasMultipleTabs = types.length > 1;

   return (
      <Box flexDirection="column" width={columns}>
         <SearchInput
            value={query}
            onChange={setQuery}
            loading={loading}
            blockSpace={currentResults.length > 0}
         />
         {hasMultipleTabs && (
            <TabBar
               activeTab={activeTab}
               skillsCount={results.skills.length}
               mcpCount={results.mcp.length}
            />
         )}
         {isSplitLayout ? (
            <Box flexDirection="row" marginTop={1}>
               <Box flexDirection="column" width={resultsWidth}>
                  <ResultsList
                     results={currentResults}
                     selectedIndex={selectedIndex}
                     installedItems={installedItems}
                     installingItem={installingItem}
                  />
               </Box>
               <DetailsPanel result={currentResult} width={detailsWidth} />
            </Box>
         ) : (
            <Box flexDirection="column" marginTop={1}>
               <ResultsList
                  results={currentResults}
                  selectedIndex={selectedIndex}
                  installedItems={installedItems}
                  installingItem={installingItem}
                  maxHeight={showStackedDetails ? 5 : 10}
               />
               {showStackedDetails && (
                  <Box marginTop={1}>
                     <DetailsPanel result={currentResult} width={detailsWidth} />
                  </Box>
               )}
            </Box>
         )}
         <Box marginTop={1}>
            <StatusBar error={error} showHelp={showHelp} showTabHint={hasMultipleTabs} />
         </Box>
      </Box>
   );
}
