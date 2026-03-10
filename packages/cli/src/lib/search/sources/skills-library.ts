import type { SearchSource, SearchResult, SearchType, SearchOptions } from '../types.js';
import { debounce } from '../debounce.js';

interface SkillsShSearchResult {
   skills: Array<{
      id: string;
      skillId: string;
      name: string;
      installs: number;
      source: string;
   }>;
}

/**
 * Skills Library search source (via skills.sh API).
 */
export class SkillsLibrarySearchSource implements SearchSource {
   readonly id = 'skills-library';
   readonly name = 'Skills Library';
   readonly types: SearchType[] = ['skills'];
   readonly experimental = false;

   constructor(private readonly apiUrl: string = 'https://skills.sh/api/search') {}

   async search(type: SearchType, options: SearchOptions): Promise<SearchResult[]> {
      if (type !== 'skills') {
         return [];
      }

      await debounce(this.id);

      const searchUrl = new URL(this.apiUrl);

      searchUrl.searchParams.set('q', options.query);
      if (options.limit) {
         searchUrl.searchParams.set('limit', String(options.limit));
      }

      const response = await fetch(searchUrl);

      if (!response.ok) {
         throw new Error(`Failed to search skills library: ${response.status}`);
      }

      const data = (await response.json()) as SkillsShSearchResult;

      return data.skills.map((skill) => ({
         name: skill.name,
         description: `Agent skill from ${skill.source}`,
         source: this.id,
         meta: {
            id: skill.id,
            installs: skill.installs,
            source: skill.source,
         },
      }));
   }
}
