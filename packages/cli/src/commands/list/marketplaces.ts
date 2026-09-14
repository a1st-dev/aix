import List from './index.js';

export default class ListMarketplaces extends List {
   static override description = 'List installed marketplace catalogs';

   protected override sectionsOverride = ['marketplaces'] as const;
}
