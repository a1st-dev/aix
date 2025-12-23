import React from 'react';
import { Box, Text } from 'ink';
import type { SearchType } from '../../../lib/search/types.js';

interface TabBarProps {
   activeTab: SearchType;
   skillsCount: number;
   mcpCount: number;
}

export function TabBar({ activeTab, skillsCount, mcpCount }: TabBarProps): React.ReactElement {
   return (
      <Box>
         <Text
            color={activeTab === 'skills' ? 'cyan' : undefined}
            bold={activeTab === 'skills'}
            inverse={activeTab === 'skills'}
         >
            {' '}
            Skills ({skillsCount}){' '}
         </Text>
         <Text> </Text>
         <Text
            color={activeTab === 'mcp' ? 'cyan' : undefined}
            bold={activeTab === 'mcp'}
            inverse={activeTab === 'mcp'}
         >
            {' '}
            MCP ({mcpCount}){' '}
         </Text>
         <Text dimColor> [Tab] to switch</Text>
      </Box>
   );
}
