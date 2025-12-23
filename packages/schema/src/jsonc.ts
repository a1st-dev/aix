import { parse, type ParseError, printParseErrorCode } from 'jsonc-parser';

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
