import type { McpServerConfig } from '@a1st/aix-schema';

/**
 * Pre-configured templates for common MCP servers.
 */
export const serverTemplates: Record<string, Partial<McpServerConfig>> = {
   github: {
      command: 'npx',
      args: ['@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
   },
   filesystem: {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem'],
   },
   postgres: {
      command: 'npx',
      args: ['@modelcontextprotocol/server-postgres'],
      env: { DATABASE_URL: '${DATABASE_URL}' },
   },
   sqlite: {
      command: 'npx',
      args: ['@modelcontextprotocol/server-sqlite'],
      env: { SQLITE_PATH: '${SQLITE_PATH}' },
   },
   memory: {
      command: 'npx',
      args: ['@modelcontextprotocol/server-memory'],
   },
   brave: {
      command: 'npx',
      args: ['@modelcontextprotocol/server-brave-search'],
      env: { BRAVE_API_KEY: '${BRAVE_API_KEY}' },
   },
   puppeteer: {
      command: 'npx',
      args: ['@modelcontextprotocol/server-puppeteer'],
   },
};

/**
 * Get a server template by name
 */
export function getServerTemplate(name: string): Partial<McpServerConfig> | undefined {
   return serverTemplates[name];
}

/**
 * List all available template names
 */
export function listServerTemplates(): string[] {
   return Object.keys(serverTemplates);
}

/**
 * Create a server config from a template with overrides
 */
export function createFromTemplate(
   templateName: string,
   overrides: Partial<McpServerConfig> = {},
): McpServerConfig {
   const template = serverTemplates[templateName];

   if (!template) {
      throw new Error(`Unknown server template: ${templateName}`);
   }

   if (!('command' in template)) {
      throw new Error(`Template "${templateName}" is missing required 'command' field`);
   }

   return {
      ...template,
      ...overrides,
   } as McpServerConfig;
}
