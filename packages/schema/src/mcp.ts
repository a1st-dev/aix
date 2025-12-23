import { z } from 'zod';

/**
 * Environment variable value. Use ${VAR_NAME} for dynamic resolution.
 */
export const envVarSchema = z
   .string()
   .describe('Environment variable value. Use ${VAR_NAME} for dynamic resolution.');

/**
 * Stdio MCP server transport config.
 * Type is inferred from presence of `command` field.
 */
export const stdioConfigSchema = z.object({
   command: z.string().describe('Command to execute'),
   args: z.array(z.string()).optional().describe('Command arguments'),
   env: z.record(envVarSchema).optional().describe('Environment variables'),
   cwd: z.string().optional().describe('Working directory'),
   shell: z.boolean().optional().describe('Run in shell'),
});

/**
 * HTTP MCP server transport config.
 * Type is inferred from presence of `url` field without `command`.
 */
export const httpConfigSchema = z.object({
   url: z.string().url().describe('MCP endpoint URL (Streamable HTTP)'),
   headers: z.record(envVarSchema).optional().describe('HTTP headers'),
   timeout: z.number().positive().optional().describe('Connection timeout (ms)'),
   validateOrigin: z.boolean().optional().describe('Validate Origin header (security)'),
});

/**
 * Tool filter - either an array of allowed tool names or include/exclude object
 */
export const toolFilterSchema = z.union([
   z.array(z.string()).describe('Allowed tool names'),
   z.object({
      include: z.array(z.string()).optional().describe('Tools to include'),
      exclude: z.array(z.string()).optional().describe('Tools to exclude'),
   }),
]);

/**
 * Resource filter - either an array of allowed patterns or include/exclude object
 */
export const resourceFilterSchema = z.union([
   z.array(z.string()).describe('Allowed resource patterns (glob)'),
   z.object({
      include: z.array(z.string()).optional().describe('Resource patterns to include'),
      exclude: z.array(z.string()).optional().describe('Resource patterns to exclude'),
   }),
]);

/**
 * Common MCP server options (non-transport).
 */
const mcpServerOptionsSchema = z.object({
   enabled: z.boolean().optional().describe('Whether server is active (default: true)'),
   tools: toolFilterSchema.optional().describe('Tool access control'),
   disabledTools: z.array(z.string()).optional().describe('Tools to disable (Windsurf format)'),
   resources: resourceFilterSchema.optional().describe('Resource access control'),
   autoStart: z.boolean().optional().describe('Start with editor (default: true)'),
   restartOnFailure: z.boolean().optional().describe('Auto-restart on crash (default: true)'),
   maxRestarts: z.number().int().positive().optional().describe('Max restart attempts (default: 3)'),
});

/**
 * Stdio MCP server config (command/args at top level).
 */
export const mcpServerConfigStdioSchema = mcpServerOptionsSchema.extend({
   command: z.string().describe('Command to execute'),
   args: z.array(z.string()).optional().describe('Command arguments'),
   env: z.record(envVarSchema).optional().describe('Environment variables'),
   cwd: z.string().optional().describe('Working directory'),
   shell: z.boolean().optional().describe('Run in shell'),
});

/**
 * HTTP MCP server config (url at top level).
 */
export const mcpServerConfigHttpSchema = mcpServerOptionsSchema.extend({
   url: z.string().url().describe('MCP endpoint URL (Streamable HTTP)'),
   headers: z.record(envVarSchema).optional().describe('HTTP headers'),
   timeout: z.number().positive().optional().describe('Connection timeout (ms)'),
   validateOrigin: z.boolean().optional().describe('Validate Origin header (security)'),
});

/**
 * MCP server config.
 * - Stdio: { command: "...", args: [...] }
 * - HTTP: { url: "https://..." }
 */
export const mcpServerConfigSchema = z.union([
   mcpServerConfigStdioSchema,
   mcpServerConfigHttpSchema,
]);

export const mcpSchema = z
   .record(
      z.string().min(1).describe('Server identifier'),
      z.union([mcpServerConfigSchema, z.literal(false)]),
   )
   .describe('Map of MCP server names to configurations (or false to disable)');

export type StdioConfig = z.infer<typeof stdioConfigSchema>;
export type HttpConfig = z.infer<typeof httpConfigSchema>;
export type McpServerConfigStdio = z.infer<typeof mcpServerConfigStdioSchema>;
export type McpServerConfigHttp = z.infer<typeof mcpServerConfigHttpSchema>;
export type ToolFilter = z.infer<typeof toolFilterSchema>;
export type ResourceFilter = z.infer<typeof resourceFilterSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
