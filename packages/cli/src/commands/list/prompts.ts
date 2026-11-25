import List from './index.js';

export default class ListPrompts extends List {
   static override description = 'List installed prompts';

   // `ls` is the alias of `aix list` itself. A subclass must not inherit it.
   static override aliases: string[] = [];

   protected override sectionsOverride = ['prompts'] as const;
}
