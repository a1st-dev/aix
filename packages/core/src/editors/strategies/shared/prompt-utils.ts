import pMap from 'p-map';
import type { EditorPrompt } from '../../types.js';
import type { ParsedPromptFrontmatter } from '../types.js';
import { extractFrontmatter, parseYamlValue, quoteYamlString } from '../../../frontmatter-utils.js';

type ParsedPromptField = 'description' | 'argument-hint';

export interface ParsePromptFilesOptions {
   files: string[];
   readFile: (filename: string) => Promise<string>;
   includeFile: (file: string) => boolean;
   stripSuffix: RegExp;
   concurrency?: number;
}

export interface FormatPromptFileOptions {
   frontmatterFields?: Array<{ key: string; value: string | undefined }>;
   valueFormatter?: (value: string) => string;
   alwaysIncludeFrontmatter?: boolean;
   includeHeading?: boolean;
   includeDescriptionParagraph?: boolean;
   trailingNewline?: boolean;
}

export async function parsePromptFiles(
   options: ParsePromptFilesOptions,
): Promise<{ prompts: Record<string, string>; warnings: string[] }> {
   const promptFiles = options.files.filter(options.includeFile);

   const readPromptFile = async (file: string): Promise<
      | { type: 'prompt'; name: string; content: string }
      | { type: 'warning'; message: string }
      | null
   > => {
      try {
         const content = await options.readFile(file);

         if (!content.trim()) {
            return null;
         }

         return {
            type: 'prompt',
            name: file.replace(options.stripSuffix, ''),
            content: content.trim(),
         };
      } catch (error) {
         return {
            type: 'warning',
            message: `Failed to read prompt ${file}: ${error instanceof Error ? error.message : String(error)}`,
         };
      }
   };

   const results = options.concurrency
      ? await pMap(promptFiles, readPromptFile, { concurrency: options.concurrency })
      : await Promise.all(promptFiles.map(readPromptFile));

   const prompts: Record<string, string> = {},
         warnings: string[] = [];

   for (const result of results) {
      if (!result) {
         continue;
      }

      if (result.type === 'warning') {
         warnings.push(result.message);
         continue;
      }

      prompts[result.name] = result.content;
   }

   return { prompts, warnings };
}

export function formatPromptFile(prompt: EditorPrompt, options: FormatPromptFileOptions = {}): string {
   const {
      frontmatterFields = [],
      valueFormatter = quoteYamlString,
      alwaysIncludeFrontmatter = false,
      includeHeading = false,
      includeDescriptionParagraph = false,
      trailingNewline = false,
   } = options;

   const lines: string[] = [];
   const populatedFields = frontmatterFields.filter(
      (field): field is { key: string; value: string } => field.value !== undefined,
   );

   if (alwaysIncludeFrontmatter || populatedFields.length > 0) {
      lines.push('---');

      for (const field of populatedFields) {
         lines.push(`${field.key}: ${valueFormatter(field.value)}`);
      }

      lines.push('---', '');
   }

   const contentStartsWithHeading = /^#\s/.test(prompt.content.trim());

   if (includeHeading && !contentStartsWithHeading) {
      lines.push(`# ${prompt.name}`, '');

      if (includeDescriptionParagraph && prompt.description) {
         lines.push(prompt.description, '');
      }
   }

   lines.push(prompt.content);

   const content = lines.join('\n');

   return trailingNewline ? `${content}\n` : content;
}

export function hasPromptFrontmatterFields(
   content: string,
   anyOf: string[],
   noneOf: string[] = [],
): boolean {
   const { frontmatter, hasFrontmatter } = extractFrontmatter(content);

   if (!hasFrontmatter) {
      return false;
   }

   const lines = frontmatter.split('\n');
   const hasRequiredField = anyOf.some((field) => parseYamlValue(lines, field) !== undefined);
   const hasForbiddenField = noneOf.some((field) => parseYamlValue(lines, field) !== undefined);

   return hasRequiredField && !hasForbiddenField;
}

export function parsePromptFrontmatter(
   rawContent: string,
   fields: ParsedPromptField[],
): ParsedPromptFrontmatter {
   const { frontmatter, content, hasFrontmatter } = extractFrontmatter(rawContent);

   if (!hasFrontmatter) {
      return { content: rawContent };
   }

   const lines = frontmatter.split('\n');
   const parsed: ParsedPromptFrontmatter = { content };

   if (fields.includes('description')) {
      parsed.description = getOptionalYamlString(lines, 'description');
   }

   if (fields.includes('argument-hint')) {
      parsed.argumentHint = getOptionalYamlListOrString(lines, 'argument-hint');
   }

   return parsed;
}

function getOptionalYamlString(lines: string[], field: string): string | undefined {
   const value = parseYamlValue(lines, field);

   return typeof value === 'string' ? value : undefined;
}

function getOptionalYamlListOrString(lines: string[], field: string): string | undefined {
   const value = parseYamlValue(lines, field);

   if (typeof value === 'string') {
      return value;
   }

   if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      return value.join(', ');
   }

   return undefined;
}
