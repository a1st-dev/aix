import { z } from 'zod';
import { gitSourceSchema, npmSourceSchema } from './rules.js';
import { editorEnum } from './editors.js';
import { mcpServerConfigSchema } from './mcp.js';

export const agentModeSchema = z
   .enum(['primary', 'subagent'])
   .default('subagent')
   .describe('Whether the agent is a primary assistant or a delegated subagent');

export const agentPermissionValueSchema = z
   .enum(['allow', 'ask', 'deny'])
   .describe('Permission policy for an agent capability');

export const agentMcpServersSchema = z
   .record(z.string(), mcpServerConfigSchema)
   .describe('MCP servers available to this agent when the target editor supports per-agent MCP');

export const agentEditorExtensionSchema = z
   .record(editorEnum, z.record(z.unknown()))
   .describe('Editor-specific agent fields that aix preserves for round-tripping');

export const agentObjectSchema = z
   .object({
      description: z.string().optional().describe('When this agent should be used'),
      mode: agentModeSchema.optional(),
      model: z.string().optional().describe('Model alias or model ID for this agent'),
      tools: z.array(z.string()).optional().describe('Tool names or tool IDs available to this agent'),
      permissions: z
         .record(agentPermissionValueSchema)
         .optional()
         .describe('Portable capability permissions such as edit, bash, web, or write'),
      mcp: agentMcpServersSchema.optional(),
      content: z.string().optional().describe('Inline agent system prompt'),
      path: z.string().optional().describe('Local file path to agent prompt content'),
      git: gitSourceSchema.optional().describe('Git repository source'),
      npm: npmSourceSchema.optional().describe('NPM package source'),
      editor: agentEditorExtensionSchema.optional(),
   })
   .refine(
      (data) => {
         const sources = [data.content, data.path, data.git, data.npm].filter(Boolean);

         return sources.length === 1;
      },
      { message: 'Exactly one content source required: content, path, git, or npm' },
   )
   .describe('Agent or subagent definition');

const agentStringSchema = z
   .string()
   .describe(
      'Source reference: local path (./, ../, /, file:), git URL (https://), or git shorthand (github:)',
   );

export const agentValueSchema = z.union([agentStringSchema, agentObjectSchema]);

export const agentNameSchema = z
   .string()
   .min(1)
   .max(64)
   .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Agent name must be lowercase alphanumeric with single hyphens (e.g., "code-reviewer")',
   )
   .describe('Agent name (used as key)');

export const agentsSchema = z
   .record(agentNameSchema, z.union([agentValueSchema, z.literal(false)]))
   .describe('Map of agent names to their definitions (or false to disable)');

export type AgentMode = z.infer<typeof agentModeSchema>;
export type AgentPermissionValue = z.infer<typeof agentPermissionValueSchema>;
export type AgentObject = z.infer<typeof agentObjectSchema>;
export type AgentValue = z.infer<typeof agentValueSchema>;
export type AgentsConfig = z.infer<typeof agentsSchema>;
