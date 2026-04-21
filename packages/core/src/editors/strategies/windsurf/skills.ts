import { NativeSkillsStrategy } from '../shared/native-skills.js';

/**
 * Windsurf skills strategy using native Agent Skills support.
 * Creates symlinks in `.windsurf/skills/{name}/` pointing at `.aix/skills/{name}/`.
 */
export class WindsurfSkillsStrategy extends NativeSkillsStrategy {
   constructor() {
      super({
         editorSkillsDir: '.windsurf/skills',
      });
   }
}
