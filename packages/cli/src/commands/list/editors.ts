import List from './index.js';

export default class ListEditors extends List {
   static override description = 'List detected editors';

   // `ls` is the alias of `aix list` itself. A subclass must not inherit it.
   static override aliases: string[] = [];

   protected override sectionsOverride = ['editors'] as const;
}
