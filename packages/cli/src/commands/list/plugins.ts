import List from './index.js';

export default class ListPlugins extends List {
   static override description = 'List installed plugins';

   // `ls` is the alias of `aix list` itself. A subclass must not inherit it.
   static override aliases: string[] = [];

   protected override sectionsOverride = ['plugins'] as const;
}
