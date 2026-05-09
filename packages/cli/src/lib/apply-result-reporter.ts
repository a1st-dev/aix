import type {
   ApplyResult,
   EditorName,
   FileChange,
   FileChangeCategory,
   UnsupportedFeatures,
} from '@a1st/aix-core';
import type { Output } from './output.js';

const CHANGE_CATEGORY_ORDER: Array<{ key: FileChangeCategory; label: string }> = [
   { key: 'skill', label: 'Skills' },
   { key: 'rule', label: 'Rules' },
   { key: 'workflow', label: 'Workflows' },
   { key: 'mcp', label: 'MCP' },
   { key: 'hook', label: 'Hooks' },
   { key: 'other', label: 'Other' },
];

const GLOBAL_CHANGE_GROUPS = [
   { label: 'Global MCP', type: 'mcp' as const },
   { label: 'Global Prompts', type: 'prompt' as const },
];

const SKILL_PATH_PATTERN =
   /(?:\.aix|\.agents|\.windsurf|\.cursor|\.claude|\.github|\.codex|\.gemini|\.opencode)\/skills\/([^/]+)/;

export interface DisplayFileChangesOptions {
   output: Output;
   quiet: boolean;
   changes: FileChange[];
   showAction?: boolean;
   blankBeforeEachCategory?: boolean;
   blankAfterEachCategory?: boolean;
}

export interface DisplayGlobalChangesOptions {
   output: Output;
   quiet: boolean;
   globalChanges?: ApplyResult['globalChanges'];
   blankBeforeEachGroup?: boolean;
   blankAfterEachGroup?: boolean;
   finalBlank?: boolean;
   showWarningsWithoutEntries?: boolean;
}

export function showUnsupportedFeatureWarnings(
   output: Output,
   quiet: boolean,
   editor: EditorName,
   unsupported?: UnsupportedFeatures,
): void {
   if (!unsupported || quiet) {
      return;
   }

   if (unsupported.mcp) {
      output.warn(
         `${editor} does not support MCP. Skipped servers: ${unsupported.mcp.servers.join(', ')}`,
      );
   }

   if (unsupported.hooks) {
      if (unsupported.hooks.allUnsupported) {
         output.warn(`${editor} does not support hooks. All hooks skipped.`);
      } else if (unsupported.hooks.unsupportedEvents?.length) {
         output.warn(
            `${editor} does not support these hook events: ${unsupported.hooks.unsupportedEvents.join(', ')}`,
         );
      }
   }

   if (unsupported.prompts) {
      output.warn(
         `${editor} does not support prompts. Skipped: ${unsupported.prompts.prompts.join(', ')}`,
      );
   }

   if (unsupported.agents) {
      output.warn(
         `${editor} does not support custom agents. Skipped: ${unsupported.agents.agents.join(', ')}`,
      );
   }
}

export function displayFileChanges(options: DisplayFileChangesOptions): void {
   const {
      output,
      quiet,
      changes,
      showAction = false,
      blankBeforeEachCategory = false,
      blankAfterEachCategory = true,
   } = options;

   if (changes.length === 0 || quiet) {
      return;
   }

   const byCategory = new Map<FileChangeCategory, FileChange[]>();

   for (const change of changes) {
      const category = change.category ?? 'other',
            list = byCategory.get(category) ?? [];

      list.push(change);
      byCategory.set(category, list);
   }

   for (const { key, label } of CHANGE_CATEGORY_ORDER) {
      const categoryChanges = byCategory.get(key);

      if (!categoryChanges || categoryChanges.length === 0) {
         continue;
      }

      if (blankBeforeEachCategory) {
         output.log('');
      }

      output.log(output.cyan(`  ${label}`));

      const seenNames = new Set<string>();

      for (const change of categoryChanges) {
         const name = key === 'skill' ? extractSkillName(change.path) : extractFileName(change.path);

         if (key === 'skill') {
            if (seenNames.has(name)) {
               continue;
            }

            seenNames.add(name);
         }

         const action = showAction ? ` ${output.dim(`(${change.action})`)}` : '';

         output.log(`    ${getChangePrefix(output, change.action)} ${name}${action}`);
      }

      if (blankAfterEachCategory) {
         output.log('');
      }
   }
}

export function displayGlobalChanges(options: DisplayGlobalChangesOptions): void {
   const {
      output,
      quiet,
      globalChanges,
      blankBeforeEachGroup = false,
      blankAfterEachGroup = true,
      finalBlank = false,
      showWarningsWithoutEntries = false,
   } = options;

   if (!globalChanges || quiet) {
      return;
   }

   const hasEntries = globalChanges.applied.length > 0 || globalChanges.skipped.length > 0;

   if (!hasEntries && !showWarningsWithoutEntries) {
      return;
   }

   let renderedGroup = false;

   for (const { label, type } of GLOBAL_CHANGE_GROUPS) {
      const applied = globalChanges.applied.filter((change) => change.type === type),
            skipped = globalChanges.skipped.filter((change) => change.type === type);

      if (applied.length === 0 && skipped.length === 0) {
         continue;
      }

      if (blankBeforeEachGroup) {
         output.log('');
      }

      output.log(output.cyan(`  ${label}`));

      for (const change of applied) {
         output.log(`    ${output.green('✓')} ${change.name}`);
      }

      for (const change of skipped) {
         output.log(`    ${output.dim('-')} ${change.name} ${output.dim(`(${change.reason})`)}`);
      }

      if (blankAfterEachGroup) {
         output.log('');
      }

      renderedGroup = true;
   }

   for (const warning of globalChanges.warnings) {
      output.warn(warning);
   }

   if (finalBlank && (renderedGroup || globalChanges.warnings.length > 0)) {
      output.log('');
   }
}

function getChangePrefix(output: Output, action: FileChange['action']): string {
   switch (action) {
      case 'create':
      case 'update':
      case 'unchanged':
         return output.green('✓');
      case 'delete':
         return output.red('-');
   }
}

function extractSkillName(path: string): string {
   const match = path.match(SKILL_PATH_PATTERN);

   return match?.[1] ?? extractFileName(path);
}

function extractFileName(path: string): string {
   const parts = path.split('/'),
         last = parts[parts.length - 1];

   return last ?? path;
}
