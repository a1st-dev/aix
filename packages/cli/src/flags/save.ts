import { Flags } from '@oclif/core';

export const saveFlag = {
   save: Flags.boolean({
      char: 's',
      description: 'Save the change to ai.json',
      default: false,
   }),
};

interface SaveDependentFlags {
   save?: boolean;
   local?: boolean;
   lock?: boolean;
   'config-only'?: boolean;
}

/**
 * Reject the combinations of config-file flags that would be ignored without a word. An add or
 * remove command leaves config files alone without `--save`, so a flag that only says how a
 * config file is changed does nothing then.
 */
export function rejectIneffectiveSaveFlags(flags: SaveDependentFlags, error: (message: string) => never): void {
   if (flags.local && flags.lock) {
      error('--lock cannot be combined with --local because ai.lock.json does not cover ai.local.json.');
   }
   if (flags.save) {
      return;
   }
   if (flags.local) {
      error('--local requires --save because no config file is changed otherwise.');
   }
   if (flags.lock) {
      error('--lock requires --save because no ai.json is changed otherwise.');
   }
   if (flags['config-only']) {
      error('--config-only requires --save; otherwise the command would make no change.');
   }
}
