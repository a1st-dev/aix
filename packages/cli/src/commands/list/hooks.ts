import { BaseCommand } from '../../base-command.js';
import type { HookAction, HookMatcher } from '@a1st/aix-schema';

type HookRow = Record<string, unknown> & {
   event: string;
   matcher: string;
   actions: string;
};

/**
 * Summarize one action as the thing it runs, so the table shows the command, URL, MCP
 * tool, or prompt rather than an opaque action count.
 */
function describeAction(action: HookAction): string {
   const type = action.type ?? 'command';

   if (type === 'http') {
      return `http ${action.url ?? ''}`.trim();
   }
   if (type === 'mcp_tool') {
      return `mcp ${action.mcp_server ?? ''}/${action.mcp_tool ?? ''}`;
   }
   if (type === 'prompt' || type === 'agent') {
      return `${type} ${action.prompt ?? ''}`.trim();
   }

   return action.command ?? action.bash ?? action.powershell ?? '(none)';
}

export default class ListHooks extends BaseCommand<typeof ListHooks> {
   static override description = 'List configured hooks';

   static override examples = [
      '<%= config.bin %> <%= command.id %>',
      '<%= config.bin %> <%= command.id %> --json',
   ];

   async run(): Promise<void> {
      const loaded = await this.requireConfig();
      const hooks = loaded.config.hooks ?? {};

      if (this.flags.json) {
         this.output.json({ hooks });
         return;
      }

      const entries = Object.entries(hooks);

      if (entries.length === 0) {
         this.output.info('No hooks configured');
         return;
      }

      const rows: HookRow[] = entries.flatMap(([ event, matchers ]) => {
         return (matchers ?? []).map((group: HookMatcher) => {
            return {
               event,
               matcher: group.matcher ?? '(all)',
               actions: group.hooks.map(describeAction).join(', '),
            };
         });
      });

      this.output.header('Hooks');
      this.output.table(rows, {
         columns: [
            { key: 'event', name: 'Event' },
            { key: 'matcher', name: 'Matcher' },
            { key: 'actions', name: 'Runs' },
         ],
         overflow: 'wrap',
      });
   }
}
