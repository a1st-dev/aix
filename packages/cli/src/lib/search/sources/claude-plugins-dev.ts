import type { SearchSource, SearchResult, SearchType, SearchOptions } from '../types.js';
import { debounce } from '../debounce.js';

interface ClaudePluginsSkillResult {
   name: string;
   description?: string;
   author?: string;
   version?: string;
   installs?: {
      total: number;
      week: number;
      month: number;
   };
}

interface ClaudePluginsSearchResponse {
   skills: ClaudePluginsSkillResult[];
   total: number;
   limit: number;
   offset: number;
}

/**
 * Claude Plugins Dev registry search source.
 * Experimental source - must be explicitly enabled.
 *
 * API: https://api.claude-plugins.dev/api/skills/search
 */
export class ClaudePluginsDevSearchSource implements SearchSource {
   readonly id = 'claude-plugins-dev';
   readonly name = 'Claude Plugins Dev';
   readonly types: SearchType[] = ['skills'];
   readonly experimental = true;

   private readonly baseUrl = 'https://api.claude-plugins.dev';

   async search(type: SearchType, options: SearchOptions): Promise<SearchResult[]> {
      if (type !== 'skills') {
         return [];
      }

      await debounce(this.id);

      const searchUrl = new URL('/api/skills/search', this.baseUrl);

      searchUrl.searchParams.set('q', options.query);
      if (options.limit) {
         searchUrl.searchParams.set('limit', String(options.limit));
      }
      if (options.offset) {
         searchUrl.searchParams.set('offset', String(options.offset));
      }

      const response = await fetch(searchUrl);

      if (!response.ok) {
         throw new Error(`Failed to search claude-plugins.dev: ${response.status}`);
      }

      const data = (await response.json()) as ClaudePluginsSearchResponse;

      return (data.skills ?? []).map((skill) => ({
         name: skill.name,
         version: skill.version,
         description: skill.description,
         source: this.id,
         meta: {
            author: skill.author,
            installs: skill.installs,
         },
      }));
   }
}
