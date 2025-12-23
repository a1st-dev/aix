import type { ServerListResponse, ServerResponse, ListServersOptions, ErrorResponse } from './types.js';

/** Default base URL for the official MCP Registry */
export const DEFAULT_BASE_URL = 'https://registry.modelcontextprotocol.io';

/** API version prefix */
const API_VERSION = 'v0.1';

/** Error thrown when the MCP Registry API returns an error */
export class McpRegistryError extends Error {
   constructor(
      message: string,
      public readonly status: number,
      public readonly response?: ErrorResponse,
   ) {
      super(message);
      this.name = 'McpRegistryError';
   }
}

/** Options for creating an MCP Registry client */
export interface McpRegistryClientOptions {
   /** Base URL for the registry API (defaults to official registry) */
   baseUrl?: string;
   /** Custom fetch implementation (defaults to global fetch) */
   fetch?: typeof fetch;
}

/**
 * Client for the official MCP Registry API.
 *
 * @example
 * ```ts
 * const client = new McpRegistryClient();
 *
 * // Search for servers
 * const results = await client.search('playwright');
 *
 * // Get a specific server
 * const server = await client.getServer('io.github.user/my-server');
 *
 * // List all servers with pagination
 * for await (const server of client.listAll()) {
 *   console.log(server.server.name);
 * }
 * ```
 */
export class McpRegistryClient {
   private readonly baseUrl: string;
   private readonly fetch: typeof fetch;

   constructor(options: McpRegistryClientOptions = {}) {
      this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
      this.fetch = options.fetch ?? globalThis.fetch;
   }

   /**
    * List servers from the registry with optional filtering.
    *
    * @param options - Filtering and pagination options
    * @returns A page of server results with pagination metadata
    */
   async list(options: ListServersOptions = {}): Promise<ServerListResponse> {
      const params = new URLSearchParams();

      if (options.cursor) {
         params.set('cursor', options.cursor);
      }
      if (options.limit !== undefined) {
         params.set('limit', String(options.limit));
      }
      if (options.updatedSince) {
         params.set('updated_since', options.updatedSince);
      }
      if (options.search) {
         params.set('search', options.search);
      }
      if (options.version) {
         params.set('version', options.version);
      }

      const queryString = params.toString();
      const url = `${this.baseUrl}/${API_VERSION}/servers${queryString ? `?${queryString}` : ''}`;

      return this.request<ServerListResponse>(url);
   }

   /**
    * Search for servers by name.
    * Convenience method that wraps `list()` with search and version=latest.
    *
    * @param query - Search query (substring match on server names)
    * @param options - Additional filtering options
    * @returns A page of matching server results
    */
   async search(
      query: string,
      options: Omit<ListServersOptions, 'search'> = {},
   ): Promise<ServerListResponse> {
      return this.list({
         ...options,
         search: query,
         version: options.version ?? 'latest',
      });
   }

   /**
    * Get all versions of a specific server.
    *
    * @param serverName - Server name in reverse-DNS format (e.g., 'io.github.user/my-server')
    * @returns List of all versions for the server
    */
   async getServerVersions(serverName: string): Promise<ServerListResponse> {
      const encodedName = encodeURIComponent(serverName);
      const url = `${this.baseUrl}/${API_VERSION}/servers/${encodedName}/versions`;

      return this.request<ServerListResponse>(url);
   }

   /**
    * Get a specific version of a server.
    *
    * @param serverName - Server name in reverse-DNS format (e.g., 'io.github.user/my-server')
    * @param version - Version string or 'latest' for the latest version
    * @returns The server configuration and metadata
    */
   async getServer(serverName: string, version = 'latest'): Promise<ServerResponse> {
      const encodedName = encodeURIComponent(serverName);
      const encodedVersion = encodeURIComponent(version);
      const url = `${this.baseUrl}/${API_VERSION}/servers/${encodedName}/versions/${encodedVersion}`;

      return this.request<ServerResponse>(url);
   }

   /**
    * Iterate over all servers in the registry with automatic pagination.
    *
    * @param options - Filtering options (cursor is managed automatically)
    * @yields Server responses one at a time
    *
    * @example
    * ```ts
    * for await (const server of client.listAll({ version: 'latest' })) {
    *   console.log(server.server.name);
    * }
    * ```
    */
   async *listAll(
      options: Omit<ListServersOptions, 'cursor'> = {},
   ): AsyncGenerator<ServerResponse, void, unknown> {
      let cursor: string | undefined;

      do {
         // eslint-disable-next-line no-await-in-loop -- Sequential pagination required
         const response = await this.list({ ...options, cursor });

         if (response.servers) {
            for (const server of response.servers) {
               yield server;
            }
         }

         cursor = response.metadata.nextCursor;
      } while (cursor);
   }

   /**
    * Make a request to the registry API.
    */
   private async request<T>(url: string): Promise<T> {
      const response = await this.fetch(url, {
         headers: {
            Accept: 'application/json',
         },
      });

      if (!response.ok) {
         let errorResponse: ErrorResponse | undefined;

         try {
            errorResponse = (await response.json()) as ErrorResponse;
         } catch {
            // Ignore JSON parse errors for error responses
         }

         const message = errorResponse?.detail ?? errorResponse?.title ?? `HTTP ${response.status}`;

         throw new McpRegistryError(message, response.status, errorResponse);
      }

      return response.json() as Promise<T>;
   }
}
