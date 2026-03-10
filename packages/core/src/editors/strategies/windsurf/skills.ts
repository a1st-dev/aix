import { NativeSkillsStrategy } from '../shared/native-skills.js';

/**
 * Windsurf skills strategy using native Agent Skills support.
 * Creates physical copies in `.windsurf/skills/{name}/` from `.agents/skills/{name}/`.
 */
export class WindsurfSkillsStrategy extends NativeSkillsStrategy {
   constructor() {
      super({
         editorSkillsDir: '.windsurf/skills',
         editorName: 'windsurf',
      });
   }
}
