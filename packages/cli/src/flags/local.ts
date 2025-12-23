import { Flags } from '@oclif/core';

/**
 * Reusable --local flag for writing to ai.local.json instead of ai.json.
 * Used by mutation commands (add, remove) to write to the local override file.
 */
export const localFlag = {
   local: Flags.boolean({
      char: 'l',
      description: 'Write to ai.local.json instead of ai.json',
      default: false,
   }),
};
