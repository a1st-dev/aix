import { Flags } from '@oclif/core';

export const saveFlag = {
   save: Flags.boolean({
      char: 's',
      description: 'Save the change to ai.json',
      default: false,
   }),
};
