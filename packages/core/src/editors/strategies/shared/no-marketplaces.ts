import type { MarketplacesConfig } from '@a1st/aix-schema';
import type { MarketplacesStrategy } from '../types.js';

/**
 * No-op marketplaces strategy for editors that don't support marketplace catalog
 * registration. Reports every supplied marketplace as unsupported.
 */
export class NoMarketplacesStrategy implements MarketplacesStrategy {
   isSupported(): boolean {
      return false;
   }

   formatConfig(_marketplaces: MarketplacesConfig): string {
      return '';
   }

   getConfigPath(): string {
      return '';
   }

   getUnsupportedMarketplaces(marketplaces: MarketplacesConfig): string[] {
      return Object.keys(marketplaces);
   }
}
