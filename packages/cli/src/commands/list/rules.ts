import List from './index.js';

export default class ListRules extends List {
   static override description = 'List installed rules';

   // `ls` is the alias of `aix list` itself. A subclass must not inherit it.
   static override aliases: string[] = [];

   protected override sectionsOverride = ['rules'] as const;
}
