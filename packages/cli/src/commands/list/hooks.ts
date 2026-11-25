import List from './index.js';

export default class ListHooks extends List {
   static override description = 'List installed hooks';

   // `ls` is the alias of `aix list` itself. A subclass must not inherit it.
   static override aliases: string[] = [];

   protected override sectionsOverride = ['hooks'] as const;
}
