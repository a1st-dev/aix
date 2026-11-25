import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
   /** A failed search, which can be retried. */
   error?: string | null;
   /** A failed install or uninstall. */
   actionError?: string | null;
   showHelp?: boolean;
   /** Whether to show tab switching hint (only when multiple tabs) */
   showTabHint?: boolean;
}

export function StatusBar({ error, actionError, showHelp, showTabHint }: StatusBarProps): React.ReactElement {
   if (error) {
      return (
         <Box>
            <Text color="red">⚠️ {error} </Text>
            <Text dimColor>[Ctrl+R] Retry</Text>
         </Box>
      );
   }

   if (actionError) {
      return (
         <Box>
            <Text color="red">⚠️ {actionError}</Text>
         </Box>
      );
   }

   if (showHelp) {
      return (
         <Box flexDirection="column">
            <Text bold>Keyboard Shortcuts:</Text>
            <Text>↑/↓ Navigate</Text>
            <Text>Enter Install or uninstall the highlighted item</Text>
            {showTabHint && <Text>Tab Switch Skills/MCP</Text>}
            <Text>Esc Clear query/Exit</Text>
            <Text>? Toggle help</Text>
         </Box>
      );
   }

   const tabHint = showTabHint ? '  [Tab] Switch' : '';

   return (
      <Box>
         <Text dimColor>[↑↓] Navigate [Enter] Install [Esc] Exit [?] Help{tabHint}</Text>
      </Box>
   );
}
