import { BaseCommand } from '../../base-command.js';
import { scopeFlag, parseScopes, includesScope } from '../../flags/scope.js';

export default class List extends BaseCommand<typeof List> {
   static override aliases = ['ls'];

   static override description = 'List configured items';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --scope skills',
      '<%= config.bin %> <%= command.id %> -s rules -s mcp',
   ];

   static override flags = {
      ...scopeFlag,
   };

   async run(): Promise<void> {
      const loaded = await this.requireConfig();
      const scopes = parseScopes(this.flags as { scope?: string[] }),
            config = loaded.config,
            result: Record<string, unknown> = {};

      if (includesScope(scopes, 'skills')) {
         result.skills = config.skills ?? {};
      }
      if (includesScope(scopes, 'mcp')) {
         result.mcp = config.mcp ?? {};
      }
      if (includesScope(scopes, 'rules')) {
         result.rules = config.rules ?? {};
      }
      if (includesScope(scopes, 'editors')) {
         result.editors = config.editors ?? {};
      }

      if (this.flags.json) {
         this.output.json(result);
         return;
      }

      for (const [scope, items] of Object.entries(result)) {
         const entries = Object.entries(items as Record<string, unknown>);

         this.output.header(this.formatScopeName(scope));

         if (entries.length === 0) {
            this.output.log(this.output.dim('  (none)'));
         } else {
            for (const [name, value] of entries) {
               const formatted = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

               this.output.log(`  ${this.output.cyan(name)}`);
               for (const line of formatted.split('\n')) {
                  this.output.log(`    ${line}`);
               }
            }
         }
      }
   }

   private formatScopeName(scope: string): string {
      const names: Record<string, string> = {
         skills: 'Skills',
         mcp: 'MCP Servers',
         rules: 'Rules',
         editors: 'Editors',
      };

      return names[scope] ?? scope;
   }
}
