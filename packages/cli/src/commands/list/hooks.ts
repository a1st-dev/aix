import List from './index.js';

export default class ListHooks extends List {
   static override description = 'List installed hooks';

   protected override sectionsOverride = ['hooks'] as const;
}
