import type { MarketplacesConfig } from '@a1st/aix-schema';
import type { MarketplacesStrategy } from '../types.js';

/**
 * Cursor marketplaces strategy. Formats marketplace catalogs into `.cursor-plugin/marketplace.json`.
 */
export class CursorMarketplacesStrategy implements MarketplacesStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return '.cursor-plugin/marketplace.json';
   }

   isProjectRootConfig(): boolean {
      return true;
   }

   formatConfig(marketplaces: MarketplacesConfig): string {
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
}
