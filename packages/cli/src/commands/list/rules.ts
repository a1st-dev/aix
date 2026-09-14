import List from './index.js';

export default class ListRules extends List {
   static override description = 'List installed rules';

   protected override sectionsOverride = ['rules'] as const;
}
