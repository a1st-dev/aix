import List from './index.js';

export default class ListAgents extends List {
   static override description = 'List installed agents';

   protected override sectionsOverride = ['agents'] as const;
}
