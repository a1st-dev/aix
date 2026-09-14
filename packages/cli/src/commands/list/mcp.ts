import List from './index.js';

export default class ListMcp extends List {
   static override aliases = ['list:mcps'];
   static override description = 'List installed MCP servers';

   protected override sectionsOverride = ['mcp'] as const;
}
