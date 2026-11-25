import List from './index.js';

export default class ListMarketplaces extends List {
   static override description = 'List installed marketplace catalogs';

   // `ls` is the alias of `aix list` itself. A subclass must not inherit it.
   static override aliases: string[] = [];

   protected override sectionsOverride = ['marketplaces'] as const;
}
