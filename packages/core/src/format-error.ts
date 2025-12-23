import type { ZodError, ZodIssue } from 'zod';
import { ConfigValidationError } from './errors.js';

export interface ValidationIssue {
   path: string;
   message: string;
}

/**
 * Convert a ZodError to a ConfigValidationError. Returns undefined if the error is not a ZodError.
 */
export function toConfigValidationError(error: unknown): ConfigValidationError | undefined {
   if (error instanceof Error && 'issues' in error) {
      const zodError = error as {
         issues: Array<{ path?: (string | number)[]; message: string }>;
      };

      return new ConfigValidationError(
         zodError.issues.map((issue) => ({
            path: Array.isArray(issue.path) ? issue.path.join('.') : '',
            message: issue.message,
         })),
      );
   }
   return undefined;
}

/**
 * Extract validation issues from a ZodError. Simplifies union errors to show the most relevant
 * message.
 * @param error - The ZodError to extract issues from
 * @param input - Original input data (used to show actual values in errors)
 */
export function extractValidationIssues(error: ZodError, input?: unknown): ValidationIssue[] {
   return error.issues.map((issue) => {
      const path = Array.isArray(issue.path) ? issue.path : [];

      return {
         path: path.join('.') || '(root)',
         message: simplifyZodMessage(issue, input, path),
      };
   });
}

/**
 * Simplify a Zod error message for human readability. Union errors are particularly verbose, so we
 * extract the most relevant message from them.
 */
function simplifyZodMessage(issue: ZodIssue, input: unknown, path: (string | number)[]): string {
   // Handle union errors specially - they're verbose
   if (issue.code === 'invalid_union') {
      const unionIssues = issue.unionErrors.flatMap((e) => e.issues);

      // Look for a type error first (most common and clear)
      const typeError = unionIssues.find((i) => i.code === 'invalid_type');

      if (typeError && typeError.code === 'invalid_type') {
         return formatTypeError(typeError.expected, input, path);
      }

      // Look for a literal error (e.g., expected false but got true)
      const literalError = unionIssues.find((i) => i.code === 'invalid_literal');

      if (literalError && literalError.code === 'invalid_literal') {
         const actualValue = getValueAtPath(input, path);

         return `Expected object or false, received ${formatReceivedValue(actualValue)}`;
      }

      // Fall back to first error message
      return unionIssues[0]?.message ?? issue.message;
   }

   if (issue.code === 'invalid_type') {
      return formatTypeError(issue.expected, input, path);
   }

   // For custom refinement errors, use the message directly
   if (issue.code === 'custom') {
      return issue.message;
   }

   return issue.message;
}

/**
 * Format type errors with actual values for literals like true/false/null. Shows "received true"
 * instead of "received boolean" for clarity.
 */
function formatTypeError(expected: string, input: unknown, path: (string | number)[]): string {
   const actualValue = getValueAtPath(input, path),
         receivedStr = formatReceivedValue(actualValue);

   return `Expected ${expected}, received ${receivedStr}`;
}

/**
 * Get a value at a nested path in an object.
 */
function getValueAtPath(obj: unknown, path: (string | number)[]): unknown {
   let current = obj;

   for (const key of path) {
      if (current == null || typeof current !== 'object') {
         return undefined;
      }
      current = (current as Record<string | number, unknown>)[key];
   }
   return current;
}

/**
 * Format a received value for display in error messages. Shows actual literal values for
 * primitives.
 */
function formatReceivedValue(value: unknown): string {
   if (value === true) {
      return 'true';
   }
   if (value === false) {
      return 'false';
   }
   if (value === null) {
      return 'null';
   }
   if (value === undefined) {
      return 'undefined';
   }
   if (typeof value === 'string') {
      return `string ("${value}")`;
   }
   if (typeof value === 'number') {
      return `number (${value})`;
   }
   if (Array.isArray(value)) {
      return 'array';
   }
   if (typeof value === 'object') {
      return 'object';
   }
   return typeof value;
}
