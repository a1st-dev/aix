import { parseJsonc, type MarketplacesConfig, type MarketplaceValue } from '@a1st/aix-schema';
import type { MarketplacesStrategy } from '../types.js';

interface ClaudeMarketplaceSource {
   source: string;
   [key: string]: unknown;
}

interface ClaudeMarketplaceEntry {
   source: ClaudeMarketplaceSource;
}

function formatImportedMarketplaceSource(source: ClaudeMarketplaceSource): MarketplaceValue {
   const git = source.source === 'github' && typeof source.repo === 'string' ? `github:${source.repo}` : source.url;

   if ((source.source === 'github' || source.source === 'git') && typeof git === 'string' && typeof source.ref === 'string') {
      return { source: { git, ref: source.ref } };
   }

   if (source.source === 'github' && typeof source.repo === 'string') {
      return `github:${source.repo}`;
   }

   if (source.source === 'directory' && typeof source.path === 'string') {
      return source.path;
   }

   if (source.source === 'git' && typeof source.url === 'string') {
      return source.url;
   }

   return JSON.stringify(source);
}

function formatGitSource(git: string, ref?: string): ClaudeMarketplaceSource {
   const githubMatch = git.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[#?].*)?$/),
         pin = ref === undefined ? {} : { ref };

   if (git.startsWith('github:')) {
      return { source: 'github', repo: git.slice(7), ...pin };
   }
   if (githubMatch) {
      return { source: 'github', repo: `${githubMatch[1]}/${githubMatch[2]}`, ...pin };
   }
   return { source: 'git', url: git, ...pin };
}

function parseClaudeMarketplaceSource(value: MarketplaceValue | false | undefined): ClaudeMarketplaceSource | null {
   if (!value) {
      return null;
   }

   let rawSource: unknown = value;

   if (typeof value === 'object' && value !== null && 'source' in value) {
      if (value.enabled === false) {
         return null;
      }
      rawSource = value.source;
   }

   if (typeof rawSource === 'string') {
      if (rawSource.startsWith('.') || rawSource.startsWith('/') || rawSource.startsWith('~')) {
         return { source: 'directory', path: rawSource };
      }

      return formatGitSource(rawSource);
   }

   if (typeof rawSource === 'object' && rawSource !== null) {
      const sourceObj = rawSource as Record<string, unknown>;

      if (typeof sourceObj.git === 'string') {
         const ref = typeof sourceObj.ref === 'string' ? sourceObj.ref : undefined;

         return formatGitSource(sourceObj.git, ref);
      }

      if (typeof sourceObj.path === 'string') {
         return { source: 'directory', path: sourceObj.path };
      }

      if (typeof sourceObj.source === 'string') {
         return sourceObj as ClaudeMarketplaceSource;
      }
   }

   return null;
}

/**
 * Claude Code marketplaces strategy. Formats catalogs into Claude Code's
 * `extraKnownMarketplaces` map in `.claude/settings.json` (or `~/.claude/settings.json`).
 */
export class ClaudeCodeMarketplacesStrategy implements MarketplacesStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'settings.json';
   }

   getGlobalConfigPath(): string {
      return '.claude/settings.json';
   }

   formatConfig(marketplaces: MarketplacesConfig): string {
      const extraKnownMarketplaces: Record<string, ClaudeMarketplaceEntry> = {};

      for (const [ name, value ] of Object.entries(marketplaces)) {
         const parsedSource = parseClaudeMarketplaceSource(value);

         if (parsedSource) {
            extraKnownMarketplaces[name] = { source: parsedSource };
         }
      }

      return JSON.stringify({ extraKnownMarketplaces }, null, 2) + '\n';
   }

   getUnsupportedMarketplaces(_marketplaces: MarketplacesConfig): string[] {
      return [];
   }

   parseImportedConfig(content: string): { marketplaces: MarketplacesConfig; warnings: string[] } {
      const parsed = parseJsonc<{ extraKnownMarketplaces?: Record<string, ClaudeMarketplaceEntry> }>(content),
            marketplaces: MarketplacesConfig = {};

      for (const [name, entry] of Object.entries(parsed.data?.extraKnownMarketplaces ?? {})) {
         marketplaces[name] = formatImportedMarketplaceSource(entry.source);
      }

      return { marketplaces, warnings: parsed.errors.map((error) => error.message) };
   }
}
