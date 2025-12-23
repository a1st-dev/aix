import type { McpServerConfig } from '@a1st/aix-schema';

/**
 * Stdio transport representation (for internal use).
 */
export interface StdioTransport {
   type: 'stdio';
   command: string;
   args?: string[];
   env?: Record<string, string>;
   cwd?: string;
   shell?: boolean;
}

/**
 * HTTP transport representation (for internal use).
 */
export interface HttpTransport {
   type: 'http';
   url: string;
   headers?: Record<string, string>;
   timeout?: number;
   validateOrigin?: boolean;
}

/**
 * Transport union type (for internal use).
 */
export type McpTransport = StdioTransport | HttpTransport;

/**
 * Stdio config shape (for type narrowing).
 */
interface StdioConfigShape {
   command: string;
   args?: string[];
   env?: Record<string, string>;
   cwd?: string;
   shell?: boolean;
}

/**
 * HTTP config shape (for type narrowing).
 */
interface HttpConfigShape {
   url: string;
   headers?: Record<string, string>;
   timeout?: number;
   validateOrigin?: boolean;
}

/**
 * Extract transport info from an MCP server config.
 * - Stdio: { command: "...", args: [...] }
 * - HTTP: { url: "https://..." }
 */
export function getTransport(config: McpServerConfig): McpTransport {
   // Use 'in' check for type narrowing
   if ('command' in config) {
      const stdio = config as unknown as StdioConfigShape;

      return {
         type: 'stdio',
         command: stdio.command,
         args: stdio.args,
         env: stdio.env,
         cwd: stdio.cwd,
         shell: stdio.shell,
      };
   }

   // Must be HTTP
   const http = config as unknown as HttpConfigShape;

   return {
      type: 'http',
      url: http.url,
      headers: http.headers,
      timeout: http.timeout,
      validateOrigin: http.validateOrigin,
   };
}
