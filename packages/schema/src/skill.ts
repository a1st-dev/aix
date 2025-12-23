import { z } from 'zod';

/**
 * Agent Skills spec frontmatter schema
 * @see https://agentskills.io/specification.md
 */
export const skillFrontmatterSchema = z.object({
   name: z
      .string()
      .min(1)
      .max(64)
      .regex(
         /^[a-z0-9]+(-[a-z0-9]+)*$/,
         'Name must be lowercase alphanumeric with single hyphens, not starting/ending with hyphen',
      ),
   description: z.string().min(1).max(1024),
   license: z.string().optional(),
   compatibility: z.string().max(500).optional(),
   metadata: z.record(z.string()).optional(),
   'allowed-tools': z.string().optional(),
});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

/**
 * Parsed skill with frontmatter and body content
 */
export interface ParsedSkill {
   frontmatter: SkillFrontmatter;
   body: string;
   basePath: string;
   source: 'local' | 'git' | 'npm';
}
