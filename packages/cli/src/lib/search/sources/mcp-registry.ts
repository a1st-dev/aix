import { McpRegistryClient, type ServerResponse } from '@a1st/mcp-registry-client';
import type { SearchSource, SearchResult, SearchType, SearchOptions } from '../types.js';
import { debounce } from '../debounce.js';

/**
 * Official MCP Registry search source.
 */
export class McpRegistrySearchSource implements SearchSource {
   readonly id = 'mcp-registry';
   readonly name = 'MCP Registry';
   readonly types: SearchType[] = ['mcp'];
   readonly experimental = false;

   private readonly client: McpRegistryClient;

   constructor() {
      this.client = new McpRegistryClient();
   }

   async search(type: SearchType, options: SearchOptions): Promise<SearchResult[]> {
      if (type !== 'mcp') {
         return [];
      }

      await debounce(this.id);

      const response = await this.client.search(options.query, {
         limit: options.limit ?? 20,
      });
      const servers: ServerResponse[] = response.servers ?? [];

      return servers.map((s) => {
         const nameParts = s.server.name.split('/'),
               friendlyName = nameParts[nameParts.length - 1] ?? s.server.name;

         return {
            name: friendlyName,
            version: s.server.version,
            description: s.server.description,
            source: this.id,
            meta: {
               fullName: s.server.name,
               repositoryUrl: s.server.repository?.url,
               websiteUrl: s.server.websiteUrl,
            },
         };
      });
   }
}
