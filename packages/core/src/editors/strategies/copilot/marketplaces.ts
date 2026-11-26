import { parseJsonc, type MarketplacesConfig } from '@a1st/aix-schema';
import type { MarketplacesStrategy } from '../types.js';
import { isRecord } from '../../../type-guards.js';
import { getGlobalCopilotDir, LEGACY_COPILOT_DIR } from './paths.js';
import {
   formatImportedMarketplaceSource,
   parseDeclarativeMarketplaceSource,
   type DeclarativeMarketplaceEntry,
} from '../shared/declarative-plugins.js';

/**
 * GitHub Copilot marketplaces strategy. Formats marketplace catalogs into `.github/copilot-marketplaces.json`
 * or the user-level `extraKnownMarketplaces` setting.
 */
export class CopilotMarketplacesStrategy implements MarketplacesStrategy {

   constructor(private readonly globalDir: string = getGlobalCopilotDir()) {}

   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return '.github/copilot-marketplaces.json';
   }

   isProjectRootConfig(): boolean {
      return true;
   }

   getGlobalConfigPath(): string {
      return `${this.globalDir}/${this.globalDir === LEGACY_COPILOT_DIR ? 'marketplaces.json' : 'settings.json'}`;
   }

   formatConfig(marketplaces: MarketplacesConfig, targetScope: 'project' | 'user' = 'project'): string {
      if (targetScope === 'user') {
         const extraKnownMarketplaces = Object.fromEntries(Object.entries(marketplaces).flatMap(([name, value]) => {
            const source = parseDeclarativeMarketplaceSource(value);

            return source ? [[name, { source }]] : [];
         }));

         return JSON.stringify({ extraKnownMarketplaces }, null, 2) + '\n';
      }

      const activeMarketplaces: Record<string, unknown> = {};

      for (const [ name, value ] of Object.entries(marketplaces)) {
         if (!value) {
            continue;
         }

         if (typeof value === 'string') {
            activeMarketplaces[name] = { source: value };
         } else if (typeof value === 'object' && value !== null) {
            if (value.enabled === false) {
               continue;
            }

            activeMarketplaces[name] = {
               source: value.source,
               ...(value.description ? { description: value.description } : {}),
            };
         }
      }

      return JSON.stringify({ marketplaces: activeMarketplaces }, null, 2) + '\n';
   }

   getUnsupportedMarketplaces(_marketplaces: MarketplacesConfig): string[] {
      return [];
   }

   parseImportedConfig(content: string): { marketplaces: MarketplacesConfig; warnings: string[] } {
      const parsed = parseJsonc<{
         extraKnownMarketplaces?: Record<string, DeclarativeMarketplaceEntry>;
         marketplaces?: MarketplacesConfig;
      }>(content);
      const native = Object.fromEntries(Object.entries(parsed.data?.extraKnownMarketplaces ?? {}).flatMap(([name, entry]) => {
         if (!isRecord(entry?.source) || typeof entry.source.source !== 'string') {
            return [];
         }

         return [[name, formatImportedMarketplaceSource(entry.source)]];
      }));

      return { marketplaces: { ...parsed.data?.marketplaces, ...native }, warnings: parsed.errors.map((error) => error.message) };
   }
}
