import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
   error?: string | null;
   showHelp?: boolean;
   /** Whether to show tab switching hint (only when multiple tabs) */
   showTabHint?: boolean;
}

export function StatusBar({ error, showHelp, showTabHint }: StatusBarProps): React.ReactElement {
   if (error) {
      return (
         <Box>
            <Text color="red">⚠️ {error} </Text>
            <Text dimColor>[r] Retry</Text>
         </Box>
      );
   }

   if (showHelp) {
      return (
         <Box flexDirection="column">
            <Text bold>Keyboard Shortcuts:</Text>
            <Text>↑/↓ or j/k Navigate</Text>
            <Text>Space/Enter Install highlighted item</Text>
            {showTabHint && <Text>Tab Switch Skills/MCP</Text>}
            <Text>Esc Clear query/Exit</Text>
            <Text>? Toggle help</Text>
         </Box>
      );
   }

   const tabHint = showTabHint ? '  [Tab] Switch' : '';

   return (
      <Box>
         <Text dimColor>[↑↓] Navigate [Space/Enter] Install [Esc] Exit [?] Help{tabHint}</Text>
      </Box>
   );
}
