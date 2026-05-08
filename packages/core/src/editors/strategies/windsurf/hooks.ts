import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, UnsupportedHookField } from '../types.js';

/**
 * Map from generic ai.json hook events to Windsurf's snake_case event names.
 * Source: https://docs.windsurf.com/windsurf/cascade/hooks
 */
const EVENT_MAP: Record<string, string> = {
   pre_file_read: 'pre_read_code',
   post_file_read: 'post_read_code',
   pre_file_write: 'pre_write_code',
   post_file_write: 'post_write_code',
   pre_command: 'pre_run_command',
   post_command: 'post_run_command',
   pre_mcp_tool: 'pre_mcp_tool_use',
   post_mcp_tool: 'post_mcp_tool_use',
   pre_prompt: 'pre_user_prompt',
   agent_stop: 'post_cascade_response',
   post_response: 'post_cascade_response',
   post_response_with_transcript: 'post_cascade_response_with_transcript',
   worktree_setup: 'post_setup_worktree',
};

const SUPPORTED_EVENTS = new Set(Object.keys(EVENT_MAP));

/** Fields that Windsurf hook entries surface natively. */
const WINDSURF_RECOGNIZED_FIELDS: ReadonlySet<keyof HookAction> = new Set([
   'type',
   'command',
   'bash',
   'powershell',
   'shell',
   'show_output',
   'working_directory',
   'cwd',
   'description',
   'name',
]);

interface WindsurfHookEntry {
   command?: string;
   powershell?: string;
   show_output?: boolean;
   working_directory?: string;
}

function buildWindsurfEntry(action: HookAction): WindsurfHookEntry | undefined {
   const useBash = action.shell !== 'powershell',
         useShell = action.shell !== 'bash',
         command = useBash ? action.command ?? action.bash : undefined,
         powershell = useShell
            ? action.powershell ?? (action.shell === 'powershell' ? action.command : undefined)
            : undefined;

   if (!command && !powershell) {
      return undefined;
   }

   const entry: WindsurfHookEntry = {};

   if (command) {
      entry.command = command;
   }
   if (powershell) {
      entry.powershell = powershell;
   }
   if (action.show_output !== undefined) {
      entry.show_output = action.show_output;
   }
   const workingDir = action.working_directory ?? action.cwd;

   if (workingDir) {
      entry.working_directory = workingDir;
   }
   return entry;
}

/**
 * Windsurf hooks strategy. Writes hooks to `hooks.json` in the `.windsurf` directory.
 * Translates generic ai.json event names to Windsurf's snake_case format.
 */
export class WindsurfHooksStrategy implements HooksStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return 'hooks.json';
   }

   getGlobalConfigPath(): string {
      return '.windsurf/hooks.json';
   }

   getUnsupportedEvents(hooks: HooksConfig): string[] {
      return Object.keys(hooks).filter((event) => !SUPPORTED_EVENTS.has(event));
   }

   getUnsupportedFields(hooks: HooksConfig): UnsupportedHookField[] {
      const result: UnsupportedHookField[] = [];

      for (const [ event, matchers ] of Object.entries(hooks)) {
         matchers?.forEach((matcher: HookMatcher, matcherIndex: number) => {
            matcher.hooks?.forEach((action, actionIndex) => {
               const fields = (Object.keys(action) as (keyof HookAction)[])
                  .filter((field) => !WINDSURF_RECOGNIZED_FIELDS.has(field));

               if (fields.length > 0) {
                  result.push({ event, matcherIndex, actionIndex, fields });
               }
            });
         });
      }

      return result;
   }

   getSupportedEvents(): readonly string[] {
      return Object.keys(EVENT_MAP).toSorted();
   }

   getNativeEventNames(): readonly string[] {
      return Array.from(new Set(Object.values(EVENT_MAP))).toSorted();
   }

   formatConfig(hooks: HooksConfig): string {
      const windsurfHooks: Record<string, WindsurfHookEntry[]> = {};

      for (const [ event, matchers ] of Object.entries(hooks)) {
         const windsurfEvent = EVENT_MAP[event];

         if (!windsurfEvent || !matchers) {
            continue;
         }

         const entries = matchers.flatMap((matcher: HookMatcher) =>
            matcher.hooks
               .map((action) => buildWindsurfEntry(action))
               .filter((entry): entry is WindsurfHookEntry => entry !== undefined),
         );

         if (entries.length === 0) {
            continue;
         }

         windsurfHooks[windsurfEvent] = (windsurfHooks[windsurfEvent] ?? []).concat(entries);
      }

      return JSON.stringify({ hooks: windsurfHooks }, null, 2) + '\n';
   }
}
