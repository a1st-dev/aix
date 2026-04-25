import { Flags } from '@oclif/core';

export const addLockFlag = {
   lock: Flags.boolean({
      description: 'Create or refresh ai.lock.json after adding',
      default: false,
   }),
};
