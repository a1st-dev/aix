import List from './index.js';

export default class ListPrompts extends List {
   static override description = 'List installed prompts';

   protected override sectionsOverride = ['prompts'] as const;
}
