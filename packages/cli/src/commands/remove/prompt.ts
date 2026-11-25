import { Args } from '@oclif/core';
import { RemoveFileItemCommand, type FileItemKind } from '../../lib/remove-file-item-command.js';

export default class RemovePrompt extends RemoveFileItemCommand {
   static override description = 'Remove a prompt/command';

   static override examples = [
      '<%= config.bin %> <%= command.id %> review',
      '<%= config.bin %> <%= command.id %> review --yes',
      '<%= config.bin %> <%= command.id %> review --no-delete',
   ];

   static override args = {
      name: Args.string({
         description: 'Prompt name to remove',
         required: true,
      }),
   };

   protected readonly kind: FileItemKind = { section: 'prompts', noun: 'prompt', reinstallSections: [ 'prompts' ] };
}
