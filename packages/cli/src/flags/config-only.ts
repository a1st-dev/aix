import { Flags } from '@oclif/core';

/**
 * Every add and remove command spells "change ai.json and leave the editors alone" the same
 * way. `--no-install`, `--no-sync`, and `--no-delete` are other accepted spellings of it.
 */
export const configOnlyFlag = {
   'config-only': Flags.boolean({
      description: 'With --save, change the config file only and leave editor config alone',
      default: false,
      aliases: ['no-install', 'no-sync', 'no-delete'],
   }),
};
