import React from 'react';
import { Box, Text } from 'ink';
import type { SearchResult } from '../../../lib/search/types.js';
import { sanitizeForTerminal, sanitizeDescription } from '../utils/sanitize.js';

interface DetailsPanelProps {
   result: SearchResult | null;
   width?: number;
}

export function DetailsPanel({ result, width }: DetailsPanelProps): React.ReactElement {
   if (!result) {
      return (
         <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} width={width}>
            <Text dimColor>Select an item to see details</Text>
         </Box>
      );
   }

   const meta = result.meta as Record<string, unknown> | undefined,
         repoUrl = meta?.repositoryUrl as string | undefined,
         websiteUrl = meta?.websiteUrl as string | undefined;

   return (
      <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} width={width}>
         <Text bold color="cyan">
            {sanitizeForTerminal(result.name)}
         </Text>
         {result.version && <Text dimColor>v{sanitizeForTerminal(result.version)}</Text>}
         <Text> </Text>
         {result.description && <Text wrap="wrap">{sanitizeDescription(result.description)}</Text>}
         <Text> </Text>
         <Text>
            📦 Source: <Text color="yellow">{sanitizeForTerminal(result.source)}</Text>
         </Text>
         {meta?.installs !== undefined && (
            <Text>
               ⬇️  Installs: <Text color="green">{sanitizeForTerminal(String(meta.installs))}</Text>
            </Text>
         )}
         {meta?.author !== undefined && (
            <Text>
               👤 Author: <Text>{sanitizeForTerminal(String(meta.author))}</Text>
            </Text>
         )}
         {repoUrl && (
            <Text>
               🔗 Repo: <Text color="blue">{sanitizeForTerminal(repoUrl)}</Text>
            </Text>
         )}
         {websiteUrl && !repoUrl && (
            <Text>
               🌐 Web: <Text color="blue">{sanitizeForTerminal(websiteUrl)}</Text>
            </Text>
         )}
         {meta?.fullName !== undefined && (
            <Text dimColor>Full name: {sanitizeForTerminal(String(meta.fullName))}</Text>
         )}
      </Box>
   );
}
