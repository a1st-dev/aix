import List from './index.js';

export default class ListEditors extends List {
   static override description = 'List detected editors';

   protected override sectionsOverride = ['editors'] as const;
}
