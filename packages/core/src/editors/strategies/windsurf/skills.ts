import { NativeSkillsStrategy } from '../shared/native-skills.js';

/**
 * Windsurf skills strategy using native Agent Skills support.
 * Creates symlinks from `.windsurf/skills/{name}/` to `.aix/skills/{name}/`.
 */
export class WindsurfSkillsStrategy extends NativeSkillsStrategy {
   constructor() {
      super({ editorSkillsDir: '.windsurf/skills' });
   }
}
