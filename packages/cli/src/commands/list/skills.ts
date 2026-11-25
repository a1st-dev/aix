import List from './index.js';

export default class ListSkills extends List {
   static override description = 'List installed skills';

   // `ls` is the alias of `aix list` itself. A subclass must not inherit it.
   static override aliases: string[] = [];

   protected override sectionsOverride = ['skills'] as const;
}
