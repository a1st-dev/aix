import List from './index.js';

export default class ListPlugins extends List {
   static override description = 'List installed plugins';

   protected override sectionsOverride = ['plugins'] as const;
}
