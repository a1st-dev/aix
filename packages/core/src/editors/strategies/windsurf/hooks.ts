import type { HookAction, HooksConfig, HookMatcher } from '@a1st/aix-schema';
import type { HooksStrategy, ParsedHooksImportResult, UnsupportedHookField } from '../types.js';
import { parseFlatImportedHooks, parseHookObject, type ImportedHookEntry } from '../shared/hook-import-utils.js';

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

function parseWindsurfEntry(value: unknown): ImportedHookEntry | null {
   if (!value || typeof value !== 'object') {
      return null;
   }

   const entry = value as Record<string, unknown>,
         command = typeof entry.command === 'string' && entry.command.length > 0 ? entry.command : undefined,
         powershell =
            typeof entry.powershell === 'string' && entry.powershell.length > 0 ? entry.powershell : undefined;

   if (!command && !powershell) {
      return null;
   }

   const action: HookAction = {};

   if (command) {
      action.command = command;
   }
   if (powershell) {
      action.powershell = powershell;
   }
   if (typeof entry.show_output === 'boolean') {
      action.show_output = entry.show_output;
   }
   if (typeof entry.working_directory === 'string' && entry.working_directory.length > 0) {
      action.working_directory = entry.working_directory;
   }

   return { action };
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

   parseImportedConfig(content: string): ParsedHooksImportResult {
      const parsed = parseHookObject(content);

      if (!parsed.rawHooks) {
         return { hooks: {}, warnings: parsed.warnings };
      }

      return {
         hooks: parseFlatImportedHooks(parsed.rawHooks, EVENT_MAP, parseWindsurfEntry),
         warnings: parsed.warnings,
      };
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
