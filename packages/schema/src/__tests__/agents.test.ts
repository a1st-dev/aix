import { describe, it, expect } from 'vitest';
import {
   agentFrontmatterSchema,
   agentNameSchema,
   agentsSchema,
} from '../agents.js';

describe('agents schema', () => {
   describe('agentNameSchema', () => {
      it('accepts valid agent names', () => {
         expect(agentNameSchema.safeParse('code-reviewer').success).toBe(true);
         expect(agentNameSchema.safeParse('tester').success).toBe(true);
         expect(agentNameSchema.safeParse('planner-v2').success).toBe(true);
      });

      it('rejects invalid agent names', () => {
         expect(agentNameSchema.safeParse('CodeReviewer').success).toBe(false);
         expect(agentNameSchema.safeParse('code_reviewer').success).toBe(false);
         expect(agentNameSchema.safeParse('-reviewer').success).toBe(false);
         expect(agentNameSchema.safeParse('reviewer-').success).toBe(false);
      });
   });

   describe('agentFrontmatterSchema', () => {
      it('validates standard agent frontmatter', () => {
         const result = agentFrontmatterSchema.safeParse({
            name: 'code-reviewer',
            description: 'Reviews code before commit',
            mode: 'subagent',
            model: 'sonnet',
            tools: ['Read', 'Grep'],
            permissions: {
               edit: 'deny',
               bash: 'ask',
            },
         });

         expect(result.success).toBe(true);
      });

      it('accepts comma-separated tools string', () => {
         const result = agentFrontmatterSchema.safeParse({
            name: 'planner',
            tools: 'Read, Grep, Bash',
         });

         expect(result.success).toBe(true);
      });

      it('preserves passthrough extra fields', () => {
         const result = agentFrontmatterSchema.safeParse({
            name: 'custom-agent',
            extraField: 'hello',
            temperature: 0.5,
         });

         expect(result.success).toBe(true);
         if (result.success) {
            expect((result.data as Record<string, unknown>).extraField).toBe('hello');
         }
      });
   });

   describe('agentsSchema', () => {
      it('validates a map of agent definitions', () => {
         const result = agentsSchema.safeParse({
            reviewer: './agents/reviewer.md',
            planner: {
               description: 'Plans tasks',
               content: 'You are a planner.',
               mode: 'primary',
            },
            disabled: false,
         });

         expect(result.success).toBe(true);
      });
   });
});
