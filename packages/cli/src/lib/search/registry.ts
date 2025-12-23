import type {
   SearchSource,
   SearchResult,
   SearchType,
   SearchOptions,
   ExperimentalSourceId,
} from './types.js';
import {
   NpmSearchSource,
   McpRegistrySearchSource,
   ClaudePluginsDevSearchSource,
} from './sources/index.js';

/**
 * Options for creating a SearchRegistry.
 */
export interface SearchRegistryOptions {
   /** NPM registry URL for skill searches */
   npmRegistry?: string;
   /** Set of experimental source IDs to enable */
   experimentalSources?: Set<ExperimentalSourceId>;
}

/**
 * Registry that manages multiple search sources and aggregates results.
 */
export class SearchRegistry {
   private readonly sources: SearchSource[] = [];

   constructor(options: SearchRegistryOptions = {}) {
      // MCP registry is always available
      this.sources.push(new McpRegistrySearchSource());

      // Register experimental sources if enabled
      if (options.experimentalSources?.has('claude-plugins-dev')) {
         // NPM skill search only makes sense alongside claude-plugins-dev for now
         // (there are no aix-skill-* packages published yet)
         this.sources.push(new NpmSearchSource(options.npmRegistry));
         this.sources.push(new ClaudePluginsDevSearchSource());
      }
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
    * Results are deduplicated by name, preferring results from non-experimental sources.
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
            // If we already have this result from a non-experimental source, keep that one
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
