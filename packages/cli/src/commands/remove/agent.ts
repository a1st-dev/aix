import { Args } from '@oclif/core';
import { RemoveFileItemCommand, type FileItemKind } from '../../lib/remove-file-item-command.js';

export default class RemoveAgent extends RemoveFileItemCommand {
   static override description = 'Remove an agent';

   static override examples = [
      '<%= config.bin %> <%= command.id %> reviewer',
      '<%= config.bin %> <%= command.id %> reviewer --yes',
      '<%= config.bin %> <%= command.id %> reviewer --save --config-only',
   ];

   static override args = {
      name: Args.string({
         description: 'Agent name to remove',
         required: true,
      }),
   };

   protected readonly kind: FileItemKind = { section: 'agents', noun: 'agent', reinstallSections: [ 'agents' ] };
}
