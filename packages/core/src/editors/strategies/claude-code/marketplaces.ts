import type { MarketplacesConfig, MarketplaceValue } from '@a1st/aix-schema';
import type { MarketplacesStrategy } from '../types.js';

interface ClaudeMarketplaceSource {
   source: string;
   [key: string]: unknown;
}

interface ClaudeMarketplaceEntry {
   source: ClaudeMarketplaceSource;
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
      if (rawSource.startsWith('github:')) {
         return { source: 'github', repo: rawSource.slice(7) };
      }

      const githubMatch = rawSource.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[#?].*)?$/);

      if (githubMatch) {
         return { source: 'github', repo: `${githubMatch[1]}/${githubMatch[2]}` };
      }

      if (rawSource.startsWith('.') || rawSource.startsWith('/') || rawSource.startsWith('~')) {
         return { source: 'directory', path: rawSource };
      }

      return { source: 'git', url: rawSource };
   }

   if (typeof rawSource === 'object' && rawSource !== null) {
      const sourceObj = rawSource as Record<string, unknown>;

      if (typeof sourceObj.git === 'string') {
         const githubMatch = sourceObj.git.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[#?].*)?$/);

         if (githubMatch) {
            return { source: 'github', repo: `${githubMatch[1]}/${githubMatch[2]}` };
         }
         return { source: 'git', url: sourceObj.git };
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
}
