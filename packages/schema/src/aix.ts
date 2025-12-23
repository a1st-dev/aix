import { z } from 'zod';

/**
 * Cache settings for managing temporary directories under .aix/.tmp/
 */
export const cacheSettingsSchema = z
   .object({
      maxBackups: z
         .number()
         .int()
         .min(1)
         .max(100)
         .default(5)
         .describe('Maximum number of backup files to keep per file'),
      maxBackupAgeDays: z
         .number()
         .int()
         .min(1)
         .max(365)
         .default(30)
         .describe('Delete backups older than this many days'),
      maxCacheAgeDays: z
         .number()
         .int()
         .min(1)
         .max(365)
         .default(7)
         .describe('Delete git-sourced cache entries older than this many days'),
   })
   .partial();

export type CacheSettings = z.infer<typeof cacheSettingsSchema>;

/**
 * aix-specific settings that don't affect the AI configuration itself.
 * Groups tool-specific configuration separate from core AI config (skills, rules, mcp, etc.)
 */
export const aixSettingsSchema = z
   .object({
      cache: cacheSettingsSchema.optional().describe('Cache and backup retention settings'),
   })
   .partial();

export type AixSettings = z.infer<typeof aixSettingsSchema>;
