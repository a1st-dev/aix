import List from './index.js';

export default class ListSkills extends List {
   static override description = 'List installed skills';

   protected override sectionsOverride = ['skills'] as const;
}
