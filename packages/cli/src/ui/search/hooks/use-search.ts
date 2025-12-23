import { useState, useCallback, useRef, useEffect } from 'react';
import type { SearchResult, SearchType } from '../../../lib/search/types.js';

interface UseSearchOptions {
   searchSkills: (options: { query: string }) => Promise<SearchResult[]>;
   searchMcp: (options: { query: string }) => Promise<SearchResult[]>;
   debounceMs?: number;
}

interface UseSearchReturn {
   query: string;
   setQuery: (query: string) => void;
   results: Record<SearchType, SearchResult[]>;
   loading: boolean;
   error: string | null;
   retry: () => void;
}

export function useSearch(options: UseSearchOptions): UseSearchReturn {
   const { searchSkills, searchMcp, debounceMs = 300 } = options;
   const [query, setQueryState] = useState('');
   const [results, setResults] = useState<Record<SearchType, SearchResult[]>>({
      skills: [],
      mcp: [],
   });
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const debounceRef = useRef<NodeJS.Timeout | null>(null);
   const abortRef = useRef<AbortController | null>(null);

   const performSearch = useCallback(
      async (searchQuery: string) => {
         if (!searchQuery.trim()) {
            setResults({ skills: [], mcp: [] });
            setLoading(false);
            return;
         }

         // Cancel previous request
         if (abortRef.current) {
            abortRef.current.abort();
         }
         abortRef.current = new AbortController();

         setLoading(true);
         setError(null);

         try {
            const [skillsResults, mcpResults] = await Promise.all([
               searchSkills({ query: searchQuery }).catch((e) => {
                  console.error('Skills search failed:', e);
                  return [];
               }),
               searchMcp({ query: searchQuery }).catch((e) => {
                  console.error('MCP search failed:', e);
                  return [];
               }),
            ]);

            setResults({ skills: skillsResults, mcp: mcpResults });
         } catch (e) {
            if ((e as Error).name !== 'AbortError') {
               setError((e as Error).message || 'Search failed');
            }
         } finally {
            setLoading(false);
         }
      },
      [searchSkills, searchMcp],
   );

   const setQuery = useCallback(
      (newQuery: string) => {
         setQueryState(newQuery);

         if (debounceRef.current) {
            clearTimeout(debounceRef.current);
         }

         debounceRef.current = setTimeout(() => {
            performSearch(newQuery);
         }, debounceMs);
      },
      [performSearch, debounceMs],
   );

   const retry = useCallback(() => {
      performSearch(query);
   }, [performSearch, query]);

   // Cleanup on unmount
   useEffect(() => {
      return () => {
         if (debounceRef.current) {
            clearTimeout(debounceRef.current);
         }
         if (abortRef.current) {
            abortRef.current.abort();
         }
      };
   }, []);

   return { query, setQuery, results, loading, error, retry };
}
