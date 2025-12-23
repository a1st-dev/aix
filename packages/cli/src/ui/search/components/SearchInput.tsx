import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface SearchInputProps {
   value: string;
   onChange: (value: string) => void;
   loading?: boolean;
   placeholder?: string;
   /** When true, space key is used for selection and should not modify the query */
   blockSpace?: boolean;
}

export function SearchInput({
   value,
   onChange,
   loading,
   placeholder,
   blockSpace,
}: SearchInputProps): React.ReactElement {
   const handleChange = (newValue: string): void => {
      // When blockSpace is true, strip any spaces that were just added (space is used for selection)
      if (blockSpace && newValue.length > value.length && newValue.endsWith(' ')) {
         return;
      }
      onChange(newValue);
   };

   return (
      <Box>
         <Text>🔍 </Text>
         <TextInput
            value={value}
            onChange={handleChange}
            placeholder={placeholder ?? 'Search skills and MCP servers...'}
         />
         {loading && <Text color="yellow"> ⏳</Text>}
      </Box>
   );
}
