import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import type { ParsedSkill } from '@a1st/aix-schema';

export interface PromptSkillInput {
   name: string;
   content: string;
   description?: string;
   argumentHint?: string;
}

export interface PromptSkillConflict {
   promptName: string;
   skillName: string;
}

export interface PromptSkillConversionResult {
   skills: Map<string, ParsedSkill>;
   conflicts: PromptSkillConflict[];
}

export interface PromptSkillConversionOptions {
   existingSkillNames?: Iterable<string | undefined>;
   tempRoot?: string;
}

const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

/**
 * Convert loaded prompts into instruction-only Agent Skills. Editors with no prompt support can
 * install these through their normal skills strategy without special prompt handling.
 */
export async function convertPromptsToSkills(
   prompts: PromptSkillInput[],
   options: PromptSkillConversionOptions = {},
): Promise<PromptSkillConversionResult> {
   const tempRoot = options.tempRoot ?? (await mkdtemp(join(tmpdir(), 'aix-prompt-skills-'))),
         usedNames = new Set<string>(),
         skills = new Map<string, ParsedSkill>(),
         conflicts: PromptSkillConflict[] = [],
         writes: Array<{ skillDir: string; skillBody: string }> = [];

   for (const name of options.existingSkillNames ?? []) {
      if (name) {
         usedNames.add(sanitizeSkillName(name));
      }
   }

   for (const prompt of prompts) {
      const baseName = sanitizeSkillName(prompt.name),
            skillName = nextAvailableSkillName(baseName, usedNames);

      usedNames.add(skillName);

      if (skillName !== baseName) {
         conflicts.push({ promptName: prompt.name, skillName });
      }

      const skillDir = join(tempRoot, skillName),
            skillBody = formatPromptSkill(prompt, skillName);

      writes.push({ skillDir, skillBody });

      skills.set(skillName, {
         frontmatter: {
            name: skillName,
            description: getPromptSkillDescription(prompt),
         },
         body: skillBody,
         basePath: skillDir,
         source: 'local',
      });
   }

   await Promise.all(
      writes.map(async ({ skillDir, skillBody }) => {
         await mkdir(skillDir, { recursive: true });
         await writeFile(join(skillDir, 'SKILL.md'), skillBody, 'utf-8');
      }),
   );

   return { skills, conflicts };
}

export function sanitizeSkillName(name: string): string {
   const sanitized = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 64)
      .replace(/-+$/g, '');

   return sanitized || 'prompt';
}

function nextAvailableSkillName(baseName: string, usedNames: Set<string>): string {
   if (!usedNames.has(baseName)) {
      return baseName;
   }

   const prefixed = truncateSkillName(`prompt-${baseName}`);

   if (!usedNames.has(prefixed)) {
      return prefixed;
   }

   let suffix = 2;

   while (true) {
      const candidate = numberedPromptSkillName(baseName, suffix);

      if (!usedNames.has(candidate)) {
         return candidate;
      }
      suffix++;
   }
}

function truncateSkillName(name: string): string {
   return name.slice(0, 64).replace(/-+$/g, '') || 'prompt';
}

function numberedPromptSkillName(baseName: string, suffix: number): string {
   const suffixText = `-${suffix}`,
         maxStemLength = 64 - suffixText.length,
         stem = truncateSkillName(`prompt-${baseName}`).slice(0, maxStemLength).replace(/-+$/g, '');

   return `${stem || 'prompt'}${suffixText}`;
}

function formatPromptSkill(prompt: PromptSkillInput, skillName: string): string {
   const description = getPromptSkillDescription(prompt),
         argumentHint = prompt.argumentHint
            ? `\nArgument hint from the original prompt: \`${prompt.argumentHint}\`\n`
            : '',
         originalName = prompt.name === skillName ? '' : ` Original prompt name: \`${prompt.name}\`.`;

   return `---\nname: ${skillName}\ndescription: ${quoteYamlString(description)}\n---\n\n${description}\n\nThis skill was generated from an aix prompt for an editor that supports Agent Skills but not prompts.${originalName}${argumentHint}\n## Instructions\n\n${prompt.content.trim()}\n`;
}

function getPromptSkillDescription(prompt: PromptSkillInput): string {
   const description = prompt.description?.trim() || `Run the ${prompt.name} prompt workflow.`;

   return description.slice(0, MAX_SKILL_DESCRIPTION_LENGTH);
}

function quoteYamlString(value: string): string {
   return JSON.stringify(value);
}
