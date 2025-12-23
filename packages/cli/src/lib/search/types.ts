/**
 * Common search result type returned by all sources.
 */
export interface SearchResult {
   name: string;
   version?: string;
   description?: string;
   source: string;
   /** Additional metadata from the source */
   meta?: Record<string, unknown>;
}

/**
 * Type of resource being searched.
 */
export type SearchType = 'skills' | 'mcp';

/**
 * Options passed to search sources.
 */
export interface SearchOptions {
   query: string;
   limit?: number;
   offset?: number;
}

/**
 * Interface that all search sources must implement.
 */
export interface SearchSource {
   /** Unique identifier for this source */
   readonly id: string;
   /** Human-readable name */
   readonly name: string;
   /** Types of resources this source provides */
   readonly types: SearchType[];
   /** Whether this source is experimental (requires opt-in) */
   readonly experimental: boolean;

   /**
    * Search for resources matching the query.
    * @param type - The type of resource to search for
    * @param options - Search options including query, limit, offset
    * @returns Array of search results
    */
   search(type: SearchType, options: SearchOptions): Promise<SearchResult[]>;
}

/**
 * Experimental source identifiers that can be enabled via --experimental flag.
 */
export type ExperimentalSourceId = 'claude-plugins-dev';

/**
 * Parse experimental flag values like "source:claude-plugins-dev".
 */
export function parseExperimentalFlags(flags: string[]): Set<ExperimentalSourceId> {
   const sources = new Set<ExperimentalSourceId>();

   for (const flag of flags) {
      if (flag.startsWith('source:')) {
         const sourceId = flag.slice('source:'.length) as ExperimentalSourceId;

         sources.add(sourceId);
      }
   }
   return sources;
}
