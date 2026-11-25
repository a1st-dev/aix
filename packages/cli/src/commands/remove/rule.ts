import { Args } from '@oclif/core';
import { RemoveFileItemCommand, type FileItemKind } from '../../lib/remove-file-item-command.js';

export default class RemoveRule extends RemoveFileItemCommand {
   static override description = 'Remove a rule';

   static override examples = [
      '<%= config.bin %> <%= command.id %> coding-standards',
      '<%= config.bin %> <%= command.id %> coding-standards --yes',
      '<%= config.bin %> <%= command.id %> coding-standards --no-delete',
   ];

   static override args = {
      name: Args.string({
         description: 'Rule name to remove',
         required: true,
      }),
   };

   protected readonly kind: FileItemKind = { section: 'rules', noun: 'rule', reinstallSections: [ 'rules' ] };
}
