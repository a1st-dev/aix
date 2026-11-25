import { Args } from '@oclif/core';
import type { AiJsonConfig } from '@a1st/aix-schema';
import { isValidSkillName, normalizeSkillName } from '../../lib/skill-source.js';
import { RemoveFileItemCommand, type FileItemKind } from '../../lib/remove-file-item-command.js';

export default class RemoveSkill extends RemoveFileItemCommand {
   static override description = 'Remove a skill';

   static override examples = [
      '<%= config.bin %> <%= command.id %> typescript',
      '<%= config.bin %> <%= command.id %> react --yes',
      '<%= config.bin %> <%= command.id %> react --no-delete',
   ];

   static override args = {
      name: Args.string({
         description: 'Skill name to remove',
         required: true,
      }),
   };

   protected readonly kind: FileItemKind = { section: 'skills', noun: 'skill', reinstallSections: [ 'skills', 'rules' ] };

   /** Skills are stored under a normalized name, but older configs may hold the name as typed. */
   protected override resolveItemName(typedName: string, config: AiJsonConfig | undefined): string {
      const normalizedName = isValidSkillName(typedName) ? typedName : normalizeSkillName(typedName);

      return config?.skills?.[typedName] !== undefined ? typedName : normalizedName;
   }
}
