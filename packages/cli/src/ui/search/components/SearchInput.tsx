import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface SearchInputProps {
   value: string;
   onChange: (value: string) => void;
   loading?: boolean;
   placeholder?: string;
}

export function SearchInput({
   value,
   onChange,
   loading,
   placeholder,
}: SearchInputProps): React.ReactElement {
   return (
      <Box>
         <Text>🔍 </Text>
         <TextInput
            value={value}
            onChange={onChange}
            placeholder={placeholder ?? 'Search skills and MCP servers...'}
         />
         {loading && <Text color="yellow"> ⏳</Text>}
      </Box>
   );
}
