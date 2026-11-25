import List from './index.js';

export default class ListAgents extends List {
   static override description = 'List installed agents';

   // `ls` is the alias of `aix list` itself. A subclass must not inherit it.
   static override aliases: string[] = [];

   protected override sectionsOverride = ['agents'] as const;
}
