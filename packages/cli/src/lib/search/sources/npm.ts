import type { SearchSource, SearchResult, SearchType, SearchOptions } from '../types.js';
import { debounce } from '../debounce.js';

interface NpmSearchResult {
   objects: Array<{
      package: {
         name: string;
         version: string;
         description: string;
         keywords: string[];
      };
   }>;
}

/**
 * NPM Registry search source for aix-skill packages.
 */
export class NpmSearchSource implements SearchSource {
   readonly id = 'npm';
   readonly name = 'NPM Registry';
   readonly types: SearchType[] = ['skills'];
   readonly experimental = false;

   constructor(private readonly registryUrl: string = 'https://registry.npmjs.org') {}

   async search(type: SearchType, options: SearchOptions): Promise<SearchResult[]> {
      if (type !== 'skills') {
         return [];
      }

      await debounce(this.id);

      const searchUrl = new URL('/-/v1/search', this.registryUrl);

      searchUrl.searchParams.set('text', `aix-skill ${options.query}`);
      searchUrl.searchParams.set('size', String(options.limit ?? 20));
      if (options.offset) {
         searchUrl.searchParams.set('from', String(options.offset));
      }

      const response = await fetch(searchUrl);

      if (!response.ok) {
         throw new Error(`Failed to search npm registry: ${response.status}`);
      }

      const data = (await response.json()) as NpmSearchResult;

      return data.objects
         .filter(
            (obj) =>
               obj.package.name.startsWith('aix-skill-') ||
               obj.package.name.includes('/aix-skill-') ||
               obj.package.keywords?.includes('aix-skill'),
         )
         .map((obj) => ({
            name: obj.package.name,
            version: obj.package.version,
            description: obj.package.description,
            source: this.id,
         }));
   }
}
