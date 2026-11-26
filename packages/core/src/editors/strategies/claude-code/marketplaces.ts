import { parseJsonc, type MarketplacesConfig } from '@a1st/aix-schema';
import type { MarketplacesStrategy } from '../types.js';
import {
   formatImportedMarketplaceSource,
   parseDeclarativeMarketplaceSource,
   type DeclarativeMarketplaceEntry,
} from '../shared/declarative-plugins.js';

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
      const extraKnownMarketplaces: Record<string, DeclarativeMarketplaceEntry> = {};

      for (const [ name, value ] of Object.entries(marketplaces)) {
         const parsedSource = parseDeclarativeMarketplaceSource(value);

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
      const parsed = parseJsonc<{ extraKnownMarketplaces?: Record<string, DeclarativeMarketplaceEntry> }>(content),
            marketplaces: MarketplacesConfig = {};

      for (const [name, entry] of Object.entries(parsed.data?.extraKnownMarketplaces ?? {})) {
         marketplaces[name] = formatImportedMarketplaceSource(entry.source);
      }

      return { marketplaces, warnings: parsed.errors.map((error) => error.message) };
   }
}
