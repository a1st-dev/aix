import type {
   SearchSource,
   SearchResult,
   SearchType,
   SearchOptions,
} from './types.js';
import {
   McpRegistrySearchSource,
   SkillsLibrarySearchSource,
} from './sources/index.js';

/**
 * Options for creating a SearchRegistry.
 */
export interface SearchRegistryOptions {
   /** NPM registry URL for skill searches (currently unused as skills.sh is used) */
   npmRegistry?: string;
}

/**
 * Registry that manages multiple search sources and aggregates results.
 */
export class SearchRegistry {
   private readonly sources: SearchSource[] = [];

   constructor(_options: SearchRegistryOptions = {}) {
      // MCP registry and Skills Library are always available
      this.sources.push(new McpRegistrySearchSource());
      this.sources.push(new SkillsLibrarySearchSource());
   }

   /**
    * Get all registered sources.
    */
   getSources(): readonly SearchSource[] {
      return this.sources;
   }

   /**
    * Get sources that support a specific search type.
    */
   getSourcesForType(type: SearchType): SearchSource[] {
      return this.sources.filter((s) => s.types.includes(type));
   }

   /**
    * Check if any sources support a specific search type.
    */
   hasSourcesForType(type: SearchType): boolean {
      return this.sources.some((s) => s.types.includes(type));
   }

   /**
    * Search across all sources for a given type, aggregating results.
    * Results are deduplicated by name.
    */
   async search(type: SearchType, options: SearchOptions): Promise<SearchResult[]> {
      const sources = this.getSourcesForType(type);

      if (sources.length === 0) {
         return [];
      }

      // Search all sources in parallel
      const searchPromises = sources.map(async (source) => {
         try {
            return await source.search(type, options);
         } catch (error) {
            // Log but don't fail the entire search if one source fails
            console.error(`Search source ${source.id} failed:`, error);
            return [];
         }
      });

      const resultsArrays = await Promise.all(searchPromises);

      // Flatten and deduplicate results
      const seen = new Map<string, SearchResult>();

      for (const results of resultsArrays) {
         for (const result of results) {
            const existing = seen.get(result.name);

            if (!existing) {
               seen.set(result.name, result);
            }
         }
      }

      return Array.from(seen.values());
   }

   /**
    * Search for skills across all skill sources.
    */
   async searchSkills(options: SearchOptions): Promise<SearchResult[]> {
      return this.search('skills', options);
   }

   /**
    * Search for MCP servers across all MCP sources.
    */
   async searchMcp(options: SearchOptions): Promise<SearchResult[]> {
      return this.search('mcp', options);
   }
}
