import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { extractValidationIssues } from '../format-error.js';

describe('extractValidationIssues', () => {
   describe('simple type errors', () => {
      it('extracts path and message from simple type mismatch', () => {
         const schema = z.object({
            name: z.string(),
         });

         const result = schema.safeParse({ name: 123 });

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, { name: 123 }),
                  first = issues[0]!;

            expect(issues).toHaveLength(1);
            expect(first.path).toBe('name');
            expect(first.message).toContain('Expected string');
            expect(first.message).toContain('number (123)');
         }
      });

      it('handles root-level errors', () => {
         const schema = z.string();

         const result = schema.safeParse(42);

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, 42),
                  first = issues[0]!;

            expect(issues).toHaveLength(1);
            expect(first.path).toBe('(root)');
            expect(first.message).toContain('Expected string');
         }
      });
   });

   describe('nested path errors', () => {
      it('formats nested paths correctly', () => {
         const schema = z.object({
            mcp: z.object({
               playwright: z.object({
                  command: z.string(),
               }),
            }),
         });

         const input = { mcp: { playwright: { command: 123 } } };
         const result = schema.safeParse(input);

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, input),
                  first = issues[0]!;

            expect(issues).toHaveLength(1);
            expect(first.path).toBe('mcp.playwright.command');
         }
      });
   });

   describe('union errors', () => {
      it('simplifies union errors to show most relevant message', () => {
         const schema = z.object({
            value: z.union([z.object({ command: z.string() }), z.literal(false)]),
         });

         const input = { value: true };
         const result = schema.safeParse(input);

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, input),
                  first = issues[0]!;

            expect(issues).toHaveLength(1);
            expect(first.path).toBe('value');
            // Should show the actual value in the message
            expect(first.message).toContain('true');
         }
      });

      it('handles union with string and object', () => {
         const schema = z.object({
            rule: z.union([z.string(), z.object({ content: z.string() })]),
         });

         const input = { rule: 42 };
         const result = schema.safeParse(input);

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, input),
                  first = issues[0]!;

            expect(issues).toHaveLength(1);
            expect(first.path).toBe('rule');
            // Should show the actual value
            expect(first.message).toContain('number (42)');
         }
      });
   });

   describe('multiple errors', () => {
      it('captures all validation errors', () => {
         const schema = z.object({
            name: z.string(),
            age: z.number(),
            active: z.boolean(),
         });

         const input = { name: 123, age: 'twenty', active: 'yes' };
         const result = schema.safeParse(input);

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, input);

            expect(issues).toHaveLength(3);
            expect(issues.map((i) => i.path)).toContain('name');
            expect(issues.map((i) => i.path)).toContain('age');
            expect(issues.map((i) => i.path)).toContain('active');
         }
      });
   });

   describe('literal value formatting', () => {
      it('shows actual value for type mismatches', () => {
         const schema = z.object({
            value: z.string(),
         });

         const input = { value: true };
         const result = schema.safeParse(input);

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, input),
                  first = issues[0]!;

            // Should show "true" as the received value
            expect(first.message).toContain('true');
         }
      });

      it('shows false value in type errors', () => {
         const schema = z.object({
            value: z.string(),
         });

         const input = { value: false };
         const result = schema.safeParse(input);

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, input),
                  first = issues[0]!;

            expect(first.message).toContain('false');
         }
      });

      it('shows null as "null"', () => {
         const schema = z.object({
            value: z.string(),
         });

         const input = { value: null };
         const result = schema.safeParse(input);

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, input),
                  first = issues[0]!;

            expect(first.message).toContain('null');
         }
      });

      it('shows string values with quotes', () => {
         const schema = z.object({
            value: z.number(),
         });

         const input = { value: 'hello' };
         const result = schema.safeParse(input);

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, input),
                  first = issues[0]!;

            expect(first.message).toContain('string ("hello")');
         }
      });
   });

   describe('custom refinement errors', () => {
      it('preserves custom error messages', () => {
         const schema = z
            .object({
               content: z.string().optional(),
               path: z.string().optional(),
            })
            .refine((data) => data.content || data.path, {
               message: 'Either content or path is required',
            });

         const input = {};
         const result = schema.safeParse(input);

         expect(result.success).toBe(false);
         if (!result.success) {
            const issues = extractValidationIssues(result.error, input),
                  first = issues[0]!;

            expect(issues).toHaveLength(1);
            expect(first.message).toBe('Either content or path is required');
         }
      });
   });
});
