import React from 'react';
import { Box, Text } from 'ink';
import type { SearchResult } from '../../../lib/search/types.js';
import { sanitizeForTerminal } from '../utils/sanitize.js';

interface ResultsListProps {
   results: SearchResult[];
   selectedIndex: number;
   /** Items that have been installed (shows checkmark) */
   installedItems: Set<string>;
   /** Item currently being installed (shows spinner) */
   installingItem: string | null;
   maxHeight?: number;
}

export function ResultsList({
   results,
   selectedIndex,
   installedItems,
   installingItem,
   maxHeight = 10,
}: ResultsListProps): React.ReactElement {
   if (results.length === 0) {
      return (
         <Box flexDirection="column" paddingLeft={1}>
            <Text dimColor>No results. Type to search.</Text>
         </Box>
      );
   }

   // Calculate visible window
   const halfWindow = Math.floor(maxHeight / 2);
   let startIndex = Math.max(0, selectedIndex - halfWindow);
   const endIndex = Math.min(results.length, startIndex + maxHeight);

   if (endIndex - startIndex < maxHeight) {
      startIndex = Math.max(0, endIndex - maxHeight);
   }

   const visibleResults = results.slice(startIndex, endIndex);

   return (
      <Box flexDirection="column">
         {visibleResults.map((result, i) => {
            const actualIndex = startIndex + i,
                  isSelected = actualIndex === selectedIndex,
                  isInstalled = installedItems.has(result.name),
                  isInstalling = installingItem === result.name,
                  prefix = isSelected ? '>' : ' ';

            // Determine the status indicator (fixed width to prevent layout shift)
            let statusIcon: React.ReactNode;

            if (isInstalling) {
               statusIcon = <Text color="yellow">⏳</Text>;
            } else if (isInstalled) {
               statusIcon = <Text color="green">✓</Text>;
            } else {
               statusIcon = <Text dimColor>○</Text>;
            }

            return (
               <Box key={result.name}>
                  <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                     {prefix}{' '}
                  </Text>
                  {statusIcon}
                  <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                     {' '}
                     {sanitizeForTerminal(result.name)}
                  </Text>
                  {result.version && <Text dimColor> v{sanitizeForTerminal(result.version)}</Text>}
               </Box>
            );
         })}
         {results.length > maxHeight && (
            <Text dimColor>
               {' '}
               ↕ {selectedIndex + 1}/{results.length}
            </Text>
         )}
      </Box>
   );
}
