/**
 * Shared utilities for parsing YAML front-matter from markdown files. These low-level utilities are
 * used by editor-specific strategies to implement their own frontmatter parsing.
 */

import { parse as parseYaml } from 'yaml';

/**
 * Result of extracting frontmatter from content.
 */
export interface ExtractedFrontmatter {
   /** The frontmatter content (without delimiters) */
   frontmatter: string;
   /** The content after the frontmatter */
   content: string;
   /** Whether frontmatter was found */
   hasFrontmatter: boolean;
}

/**
 * Extract YAML frontmatter from markdown content.
 * @param rawContent - Raw markdown content potentially containing front-matter
 * @returns Extracted frontmatter and remaining content
 */
export function extractFrontmatter(rawContent: string): ExtractedFrontmatter {
   const frontmatterMatch = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

   if (!frontmatterMatch) {
      return { frontmatter: '', content: rawContent, hasFrontmatter: false };
   }

   return {
      frontmatter: frontmatterMatch[1]!,
      content: rawContent.slice(frontmatterMatch[0].length).trim(),
      hasFrontmatter: true,
   };
}

/**
 * Parse a YAML value from frontmatter by key.
 * @param lines - Array of frontmatter lines (joined back for YAML parsing)
 * @param key - The key to look for
 * @returns The parsed value, or undefined if not found
 */
export function parseYamlValue(lines: string[], key: string): string | boolean | string[] | undefined {
   const frontmatter = lines.join('\n'),
         parsed = parseAllFrontmatter(frontmatter),
         value = parsed[key];

   if (value === undefined) {
      return undefined;
   }

   // Return primitives and arrays directly
   if (typeof value === 'string' || typeof value === 'boolean' || Array.isArray(value)) {
      return value as string | boolean | string[];
   }

   // Convert other types to string
   return String(value);
}

/**
 * Parse all key-value pairs from frontmatter into a raw object using the yaml library.
 * Falls back to simple line-based parsing if YAML parsing fails (e.g., for unquoted glob patterns).
 * @param frontmatter - The frontmatter content (without delimiters)
 * @returns Object with all parsed key-value pairs
 */
export function parseAllFrontmatter(frontmatter: string): Record<string, unknown> {
   if (!frontmatter.trim()) {
      return {};
   }

   try {
      const parsed = parseYaml(frontmatter) as Record<string, unknown> | null;

      return parsed ?? {};
   } catch {
      // Fall back to simple line-based parsing for edge cases like unquoted glob patterns
      return parseSimpleFrontmatter(frontmatter);
   }
}

/**
 * Simple line-based frontmatter parser for cases where YAML parsing fails.
 * Handles basic key: value pairs and YAML arrays.
 */
function parseSimpleFrontmatter(frontmatter: string): Record<string, unknown> {
   const result: Record<string, unknown> = {},
         lines = frontmatter.split('\n');

   let currentKey: string | null = null,
       arrayValues: string[] = [];

   for (const line of lines) {
      // Check for array item (indented with -)
      const arrayItemMatch = line.match(/^\s+-\s+(.+)$/);

      if (arrayItemMatch && currentKey) {
         arrayValues.push(arrayItemMatch[1]!.trim());
         continue;
      }

      // If we were collecting array values, store them
      if (currentKey && arrayValues.length > 0) {
         result[currentKey] = arrayValues;
         arrayValues = [];
         currentKey = null;
      }

      // Check for key: value pair
      const keyValueMatch = line.match(/^([\w-]+):\s*(.*)$/);

      if (!keyValueMatch) {
         continue;
      }

      const key = keyValueMatch[1]!,
            rawValue = keyValueMatch[2]!.trim();

      // Empty value means array starts on next line
      if (!rawValue) {
         currentKey = key;
         arrayValues = [];
         continue;
      }

      // Boolean values
      if (rawValue === 'true') {
         result[key] = true;
      } else if (rawValue === 'false') {
         result[key] = false;
      } else {
         // Remove surrounding quotes if present
         result[key] = rawValue.replace(/^["']|["']$/g, '');
      }
   }

   // Handle any remaining array values
   if (currentKey && arrayValues.length > 0) {
      result[currentKey] = arrayValues;
   }

   return result;
}
