import { mkdir, cp, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'pathe';
import pMap from 'p-map';
import type { SkillsStrategy } from '../types.js';
import type { ParsedSkill } from '@a1st/aix-schema';
import type { EditorRule, FileChange } from '../../types.js';

/**
 * Kiro skills strategy - converts Agent Skills to Kiro Powers.
 * Skills are stored in `.aix/skills/` (source of truth) and converted to Powers in `.kiro/powers/`
 * during installation.
 */
export class KiroSkillsStrategy implements SkillsStrategy {
   getSkillsDir(): string {
      return '.aix/skills';
   }

   isNative(): boolean {
      return false; // Kiro doesn't support Agent Skills natively
   }

   async installSkills(
      skills: Map<string, ParsedSkill>,
      projectRoot: string,
      options: { dryRun?: boolean } = {},
   ): Promise<FileChange[]> {
      const entries = Array.from(skills.entries());

      const nestedChanges = await pMap(
         entries,
         async ([name, skill]) => {
            const changes: FileChange[] = [];

            // 1. Copy to .aix/skills/{name}/ (source of truth)
            const aixSkillDir = join(projectRoot, '.aix', 'skills', name);
            const aixExists = existsSync(aixSkillDir);

            if (!options.dryRun) {
               await mkdir(dirname(aixSkillDir), { recursive: true });
               await cp(skill.basePath, aixSkillDir, { recursive: true, force: true });
            }

            changes.push({
               path: aixSkillDir,
               action: aixExists ? 'update' : 'create',
               content: `[skill directory: ${skill.basePath}]`,
               isDirectory: true,
               category: 'skill',
            });

            // 2. Convert to Power in .kiro/powers/{name}/
            const powerDir = join(projectRoot, '.kiro', 'powers', name);
            const powerMdPath = join(powerDir, 'POWER.md');

            // Generate POWER.md content
            const powerContent = this.generatePowerMd(name, skill);

            if (!options.dryRun) {
               await mkdir(powerDir, { recursive: true });
            }

            changes.push({
               path: powerDir,
               action: 'create',
               isDirectory: true,
               category: 'skill',
            });

            changes.push({
               path: powerMdPath,
               action: 'create',
               content: powerContent,
               category: 'skill',
            });

            // 3. Copy scripts and resources from skill to power
            // Check if there are any script files in the skill directory
            if (!options.dryRun) {
               await this.copySkillResources(skill.basePath, powerDir, changes);
            }

            return changes;
         },
         { concurrency: 5 },
      );

      return nestedChanges.flat();
   }

   generateSkillRules(_skills: Map<string, ParsedSkill>): EditorRule[] {
      // Kiro doesn't use pointer rules - Powers are installed via IDE UI
      return [];
   }

   /**
    * Generate POWER.md content from a skill.
    */
   private generatePowerMd(name: string, skill: ParsedSkill): string {
      const lines: string[] = ['---'];

      // Generate frontmatter
      lines.push(`name: ${name}`);

      if (skill.frontmatter.description) {
         lines.push(`description: ${skill.frontmatter.description}`);
      } else {
         lines.push(`description: ${name} skill converted to Kiro Power`);
      }

      // Generate keywords from name and description
      const keywords = this.generateKeywords(name, skill.frontmatter.description);

      lines.push(`keywords: ${keywords.join(', ')}`);

      lines.push('---', '');

      // Add onboarding section
      lines.push('# Onboarding', '');
      lines.push(`This Power was converted from the Agent Skill: ${name}`, '');
      lines.push('## Setup', '');
      lines.push('To install this Power:');
      lines.push('1. Open Kiro IDE');
      lines.push('2. Navigate to Powers settings');
      lines.push(`3. Install from local directory: \`.kiro/powers/${name}/\``, '');

      // Add workflows section
      lines.push('# Workflows', '');

      if (skill.body) {
         lines.push(skill.body);
      } else {
         lines.push(`Use this Power for ${name}-related tasks.`);
      }

      return lines.join('\n');
   }

   /**
    * Generate keywords from skill name and description.
    */
   private generateKeywords(name: string, description?: string): string[] {
      const keywords = new Set<string>();

      // Add name as keyword (split on hyphens and underscores)
      const nameParts = name.split(/[-_]/);

      for (const part of nameParts) {
         if (part.length > 2) {
            keywords.add(part.toLowerCase());
         }
      }

      // Extract keywords from description
      if (description) {
         const words = description.toLowerCase().split(/\s+/);

         for (const word of words) {
            // Remove punctuation and filter short words
            const cleaned = word.replace(/[^a-z0-9]/g, '');

            if (cleaned.length > 3) {
               keywords.add(cleaned);
            }
         }
      }

      // Limit to 5 most relevant keywords
      return Array.from(keywords).slice(0, 5);
   }

   /**
    * Copy scripts and resources from skill directory to power directory.
    */
   private async copySkillResources(
      skillPath: string,
      powerPath: string,
      changes: FileChange[],
   ): Promise<void> {
      // For now, we'll just copy all files except SKILL.md
      // In a more sophisticated implementation, we could detect script files
      // and set executable permissions
      try {
         const { readdir, stat } = await import('node:fs/promises');
         const files = await readdir(skillPath);

         // Process all files in parallel
         const fileOperations = files
            .filter(file => file !== 'SKILL.md')
            .map(async (file) => {
               const sourcePath = join(skillPath, file);
               const destPath = join(powerPath, file);
               const stats = await stat(sourcePath);

               if (stats.isFile()) {
                  await mkdir(dirname(destPath), { recursive: true });
                  await cp(sourcePath, destPath, { force: true });

                  // Set executable permissions for script files
                  if (this.isScriptFile(file)) {
                     await chmod(destPath, 0o755);
                  }

                  return {
                     path: destPath,
                     action: 'create' as const,
                     content: `[copied from skill: ${file}]`,
                     category: 'skill' as const,
                  };
               } else if (stats.isDirectory()) {
                  // Recursively copy directories
                  await cp(sourcePath, destPath, { recursive: true, force: true });

                  return {
                     path: destPath,
                     action: 'create' as const,
                     content: '[directory copied from skill]',
                     isDirectory: true,
                     category: 'skill' as const,
                  };
               }

               return null;
            });

         const results = await Promise.all(fileOperations);

         changes.push(...results.filter((r): r is NonNullable<typeof r> => r !== null));
      } catch (err) {
         // If we can't read the directory, just skip copying resources
         console.warn(`Failed to copy resources from ${skillPath}:`, err);
      }
   }

   /**
    * Check if a file is a script file based on extension.
    */
   private isScriptFile(filename: string): boolean {
      const scriptExtensions = ['.sh', '.bash', '.zsh', '.py', '.rb', '.js', '.ts', '.mjs'];

      return scriptExtensions.some(ext => filename.endsWith(ext));
   }
}
