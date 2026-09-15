import {
   parse,
   parseTree,
   findNodeAtLocation,
   createScanner,
   SyntaxKind,
   type ParseError,
   printParseErrorCode,
   modify,
   applyEdits,
   type JSONPath,
} from 'jsonc-parser';

export interface JsoncParseResult<T> {
   data?: T;
   errors: Array<{ message: string; offset: number; length: number }>;
}

export function parseJsonc<T = unknown>(content: string): JsoncParseResult<T> {
   const errors: ParseError[] = [],
         data = parse(content, errors, {
            allowTrailingComma: true,
            disallowComments: false,
         }) as T;

   return {
      data: errors.length === 0 ? data : undefined,
      errors: errors.map((e) => ({
         message: printParseErrorCode(e.error),
         offset: e.offset,
         length: e.length,
      })),
   };
}

export interface JsoncModifyOptions {
   tabSize?: number;
   insertSpaces?: boolean;
   eol?: string;
}

export interface JsoncMergeContext {
   key: string;
   path: string[];
   oldValue: unknown;
   newValue: unknown;
}

export type JsoncMergeStrategy = 'merge' | 'replace' | 'keep';

export type JsoncMergeResolver = (context: JsoncMergeContext) => JsoncMergeStrategy | undefined;

export interface JsoncMergeOptions extends JsoncModifyOptions {
   resolver?: JsoncMergeResolver;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
   return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function detectJsoncIndent(content: string): { tabSize: number; insertSpaces: boolean } {
   const match = content.match(/^[ \t]+(?=\S)/m);

   if (!match) {
      return { tabSize: 3, insertSpaces: true };
   }

   const indentStr = match[0];

   if (indentStr.startsWith('\t')) {
      return { tabSize: 1, insertSpaces: false };
   }

   return { tabSize: indentStr.length, insertSpaces: true };
}

function safeRemoveFirstChildProperty(content: string, path: (string | number)[]): string | undefined {
   const root = parseTree(content);

   if (!root) {
      return undefined;
   }

   const node = findNodeAtLocation(root, path as JSONPath);

   if (!node) {
      return undefined;
   }

   const propNode = node.parent;

   if (!propNode || propNode.type !== 'property') {
      return undefined;
   }

   const parent = propNode.parent;

   if (!parent || parent.type !== 'object' || !Array.isArray(parent.children)) {
      return undefined;
   }

   const children = parent.children,
         index = children.indexOf(propNode);

   if (index !== 0 || children.length <= 1) {
      return undefined;
   }

   const nextChild = children[1];

   if (!nextChild) {
      return undefined;
   }

   const scanner = createScanner(content, false);

   scanner.setPosition(propNode.offset + propNode.length);

   let token = scanner.scan();

   while (token !== SyntaxKind.EOF && token !== SyntaxKind.CommaToken && scanner.getTokenOffset() < nextChild.offset) {
      token = scanner.scan();
   }

   let removeEnd = propNode.offset + propNode.length;

   if (token === SyntaxKind.CommaToken) {
      removeEnd = scanner.getTokenOffset() + scanner.getTokenLength();

      const afterComma = content.slice(removeEnd),
            lineBreak = afterComma.match(/^[ \t]*\r?\n/);

      if (lineBreak) {
         removeEnd += lineBreak[0].length;
      }
   }

   let removeBegin = propNode.offset;

   while (removeBegin > parent.offset + 1 && content[removeBegin - 1] !== '\n') {
      removeBegin--;
   }

   const triviaScanner = createScanner(content, false);

   triviaScanner.setPosition(parent.offset + 1);

   let t = triviaScanner.scan(),
       lastCommentOffset = -1;

   while (triviaScanner.getTokenOffset() < propNode.offset) {
      if (t === SyntaxKind.LineCommentTrivia || t === SyntaxKind.BlockCommentTrivia) {
         lastCommentOffset = triviaScanner.getTokenOffset();
      }
      t = triviaScanner.scan();
   }

   if (lastCommentOffset !== -1) {
      const between = content.slice(lastCommentOffset, propNode.offset);

      if (!/(?:\r?\n){2}/.test(between)) {
         removeBegin = lastCommentOffset;
         while (removeBegin > parent.offset + 1 && content[removeBegin - 1] !== '\n') {
            removeBegin--;
         }
      }
   }

   return content.slice(0, removeBegin) + content.slice(removeEnd);
}

/**
 * Modify or remove a value at a specified path in a JSONC string while preserving comments.
 */
export function modifyJsonc(
   content: string,
   path: (string | number)[],
   value: unknown,
   options: JsoncModifyOptions = {},
): string {
   if (value === undefined) {
      const firstChildRemoval = safeRemoveFirstChildProperty(content, path);

      if (firstChildRemoval !== undefined) {
         if (content.endsWith('\n') && !firstChildRemoval.endsWith('\n')) {
            return firstChildRemoval + '\n';
         }

         return firstChildRemoval;
      }
   }

   const formattingOptions = {
      ...detectJsoncIndent(content),
      ...options,
   };
   const edits = modify(content, path as JSONPath, value, { formattingOptions });

   let result = applyEdits(content, edits);

   if (content.endsWith('\n') && !result.endsWith('\n')) {
      result += '\n';
   }

   return result;
}

/**
 * Remove a property at a specified path in a JSONC string while preserving comments.
 */
export function removeJsoncProperty(
   content: string,
   path: (string | number)[],
   options?: JsoncModifyOptions,
): string {
   return modifyJsonc(content, path, undefined, options);
}

/**
 * Deeply merge an override object into existing JSONC content while preserving comments.
 */
export function mergeJsonc(
   content: string,
   override: Record<string, unknown>,
   options: JsoncMergeOptions = {},
): string {
   if (!content.trim()) {
      const tabSize = options.tabSize ?? 3;

      return JSON.stringify(override, null, tabSize) + '\n';
   }

   let current = content;
   const formattingOptions = {
      ...detectJsoncIndent(current),
      ...options,
   };

   function getExistingValueAtPath(path: string[]): unknown {
      const parsed = parse(current);
      let val: unknown = parsed;

      for (const p of path) {
         if (!isPlainObject(val) && !Array.isArray(val)) {
            return undefined;
         }
         val = (val as Record<string, unknown>)[p];
      }

      return val;
   }

   function applyLevel(obj: Record<string, unknown>, path: string[]): void {
      for (const [key, newValue] of Object.entries(obj)) {
         const currentPath = [...path, key],
               oldValue = getExistingValueAtPath(currentPath),
               strategy = options.resolver?.({ key, path, oldValue, newValue });

         if (strategy === 'keep') {
            continue;
         }

         if (oldValue !== undefined && JSON.stringify(oldValue) === JSON.stringify(newValue)) {
            continue;
         }

         if (strategy === 'replace') {
            current = modifyJsonc(current, currentPath, newValue, formattingOptions);
         } else if (isPlainObject(newValue) && isPlainObject(oldValue)) {
            applyLevel(newValue, currentPath);
         } else {
            current = modifyJsonc(current, currentPath, newValue, formattingOptions);
         }
      }
   }

   applyLevel(override, []);

   if (content.endsWith('\n') && !current.endsWith('\n')) {
      current += '\n';
   }

   return current;
}

/**
 * Apply changes from newObject to existing JSONC content, adding, updating, or removing
 * properties while preserving comments on unchanged fields.
 */
export function applyJsoncDiff(
   content: string,
   newObject: Record<string, unknown>,
   options: JsoncModifyOptions = {},
): string {
   let current = content;
   const formattingOptions = {
      ...detectJsoncIndent(current),
      ...options,
   };

   function diffLevel(oldLevel: unknown, newLevel: unknown, path: string[]): void {
      if (isPlainObject(oldLevel)) {
         for (const key of Object.keys(oldLevel)) {
            if (!isPlainObject(newLevel) || !(key in newLevel)) {
               current = modifyJsonc(current, [...path, key], undefined, formattingOptions);
            }
         }
      }

      if (isPlainObject(newLevel)) {
         for (const [key, newValue] of Object.entries(newLevel)) {
            const oldValue = isPlainObject(oldLevel) ? oldLevel[key] : undefined,
                  currentPath = [...path, key];

            if (isPlainObject(newValue) && isPlainObject(oldValue)) {
               diffLevel(oldValue, newValue, currentPath);
            } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
               current = modifyJsonc(current, currentPath, newValue, formattingOptions);
            }
         }
      }
   }

   const oldObj = parse(current);

   if (!isPlainObject(oldObj)) {
      return JSON.stringify(newObject, null, formattingOptions.tabSize) + '\n';
   }

   diffLevel(oldObj, newObject, []);

   if (content.endsWith('\n') && !current.endsWith('\n')) {
      current += '\n';
   }

   return current;
}
