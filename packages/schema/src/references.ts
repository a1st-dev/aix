import { z } from 'zod';
import { semverRangeSchema } from './core.js';

export const localRefSchema = z.object({
   path: z.string().describe('Local file or directory path'),
});

export const gitRefSchema = z.object({
   git: z.string().describe('Git URL (e.g., "github:user/repo", "https://...")'),
   ref: z.string().optional().describe('Git ref (branch, tag, commit)'),
   path: z.string().optional().describe('Subdirectory within repo'),
});

export const npmRefSchema = z.object({
   npm: z.string().describe('NPM package name (e.g., "@company/skills")'),
   path: z.string().optional().describe('Subdirectory within the package'),
   version: z.string().optional().describe('Version to auto-install (omit to use project node_modules)'),
});

export const registryRefSchema = z.object({
   version: semverRangeSchema.describe('Version range from registry'),
   registry: z.string().url().optional().describe('Custom registry URL'),
});

export const sourceRefSchema = z
   .union([
      z.string().describe('Shorthand: version range or local path'),
      gitRefSchema,
      // Before the local and registry forms: an npm reference may carry `path` or `version`
      // too, and a union keeps only the keys of the first member that matches.
      npmRefSchema,
      localRefSchema,
      registryRefSchema,
   ])
   .describe('Reference to a skill, config, or resource');
