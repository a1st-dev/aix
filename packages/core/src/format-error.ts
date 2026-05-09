import { ConfigValidationError } from './errors.js';

export interface ValidationIssue {
   path: string;
   message: string;
}

interface ZodIssueLike {
   readonly code?: string;
   readonly message: string;
   readonly path?: readonly PropertyKey[];
   readonly expected?: unknown;
   readonly values?: readonly unknown[];
   readonly errors?: readonly ZodIssueLike[][];
   readonly unionErrors?: readonly ZodErrorLike[];
}

interface ZodErrorLike {
   readonly issues: readonly ZodIssueLike[];
}

/**
 * Convert a ZodError to a ConfigValidationError. Returns undefined if the error is not a ZodError.
 */
export function toConfigValidationError(error: unknown): ConfigValidationError | undefined {
   if (isZodErrorLike(error)) {
      return new ConfigValidationError(extractValidationIssues(error));
   }

   return undefined;
}

/**
 * Extract validation issues from a ZodError. Simplifies union errors to show the most relevant
 * message.
 * @param error - The ZodError-like value to extract issues from
 * @param input - Original input data (used to show actual values in errors)
 */
export function extractValidationIssues(error: ZodErrorLike, input?: unknown): ValidationIssue[] {
   return error.issues.map((issue) => {
      const path = Array.isArray(issue.path) ? issue.path : [];

      return {
         path: path.length > 0 ? path.map(String).join('.') : '(root)',
         message: simplifyZodMessage(issue, input, path),
      };
   });
}

/**
 * Simplify a Zod error message for human readability. Union errors are particularly verbose, so we
 * extract the most relevant message from them.
 */
function simplifyZodMessage(issue: ZodIssueLike, input: unknown, path: readonly PropertyKey[]): string {
   // Handle union errors specially - they're verbose
   if (issue.code === 'invalid_union') {
      const unionIssues = getUnionIssues(issue),
            expectedUnionValue = getExpectedUnionValue(unionIssues);

      if (expectedUnionValue) {
         return `Expected ${expectedUnionValue}, received ${formatReceivedValue(getValueAtPath(input, path))}`;
      }

      // Fall back to first error message
      return unionIssues[0]?.message ?? issue.message;
   }

   if (issue.code === 'invalid_type' && typeof issue.expected === 'string') {
      return formatTypeError(issue.expected, input, path);
   }

   if (issue.code === 'invalid_literal' && issue.expected !== undefined) {
      return formatValueError(issue.expected, input, path);
   }

   if (issue.code === 'invalid_value' && Array.isArray(issue.values) && issue.values.length > 0) {
      return formatValueError(issue.values, input, path);
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
function formatTypeError(expected: string, input: unknown, path: readonly PropertyKey[]): string {
   const actualValue = getValueAtPath(input, path),
         receivedStr = formatReceivedValue(actualValue);

   return `Expected ${expected}, received ${receivedStr}`;
}

function formatValueError(expected: unknown | readonly unknown[], input: unknown, path: readonly PropertyKey[]): string {
   return `Expected ${formatExpectedValue(expected)}, received ${formatReceivedValue(getValueAtPath(input, path))}`;
}

/**
 * Get a value at a nested path in an object.
 */
function getValueAtPath(obj: unknown, path: readonly PropertyKey[]): unknown {
   let current = obj;

   for (const key of path) {
      if (!isObjectLike(current)) {
         return undefined;
      }

      current = Reflect.get(current, key);
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

function getUnionIssues(issue: ZodIssueLike): ZodIssueLike[] {
   if (Array.isArray(issue.errors)) {
      return issue.errors.flatMap((issues) => issues);
   }

   if (Array.isArray(issue.unionErrors)) {
      return issue.unionErrors.flatMap((error) => error.issues);
   }

   return [];
}

function getExpectedUnionValue(unionIssues: readonly ZodIssueLike[]): string | undefined {
   const expectedParts = new Set<string>();

   for (const issue of unionIssues) {
      if (issue.code === 'invalid_type' && typeof issue.expected === 'string') {
         expectedParts.add(issue.expected);
         continue;
      }

      if (issue.code === 'invalid_literal' && issue.expected !== undefined) {
         expectedParts.add(formatExpectedValue(issue.expected));
         continue;
      }

      if (issue.code === 'invalid_value' && Array.isArray(issue.values)) {
         for (const value of issue.values) {
            expectedParts.add(formatExpectedValue(value));
         }
      }
   }

   return joinExpectedParts([ ...expectedParts ]);
}

function joinExpectedParts(expectedParts: readonly string[]): string | undefined {
   if (expectedParts.length === 0) {
      return undefined;
   }

   if (expectedParts.length === 1) {
      return expectedParts[0];
   }

   const lastExpectedPart = expectedParts.at(-1),
         leadingExpectedParts = expectedParts.slice(0, -1);

   if (!lastExpectedPart) {
      return undefined;
   }

   if (leadingExpectedParts.length === 1) {
      return `${leadingExpectedParts[0]} or ${lastExpectedPart}`;
   }

   return `${leadingExpectedParts.join(', ')}, or ${lastExpectedPart}`;
}

function formatExpectedValue(value: unknown): string {
   if (Array.isArray(value)) {
      return joinExpectedParts(value.map(formatExpectedValue)) ?? 'the expected value';
   }

   if (typeof value === 'string') {
      return `"${value}"`;
   }

   return String(value);
}

function isObjectLike(value: unknown): value is object {
   return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function isPropertyKey(value: unknown): value is PropertyKey {
   return typeof value === 'string' || typeof value === 'number' || typeof value === 'symbol';
}

function isPropertyKeyArray(value: unknown): value is PropertyKey[] {
   return Array.isArray(value) && value.every(isPropertyKey);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
   return typeof value === 'object' && value !== null;
}

function isZodIssueLike(value: unknown): value is ZodIssueLike {
   return isRecord(value)
      && typeof value.message === 'string'
      && (value.path === undefined || isPropertyKeyArray(value.path))
      && (value.code === undefined || typeof value.code === 'string')
      && (value.errors === undefined || isNestedIssueArray(value.errors))
      && (value.unionErrors === undefined || isZodErrorArray(value.unionErrors));
}

function isNestedIssueArray(value: unknown): value is ZodIssueLike[][] {
   return Array.isArray(value) && value.every((issues) => Array.isArray(issues) && issues.every(isZodIssueLike));
}

export function isZodErrorLike(value: unknown): value is ZodErrorLike {
   return isRecord(value) && Array.isArray(value.issues) && value.issues.every(isZodIssueLike);
}

function isZodErrorArray(value: unknown): value is ZodErrorLike[] {
   return Array.isArray(value) && value.every(isZodErrorLike);
}
