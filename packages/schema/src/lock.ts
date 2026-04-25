import { z } from 'zod';

export const lockfileVersion = 1;

const sha256DigestSchema = z
   .string()
   .regex(/^sha256:[a-f0-9]{64}$/, 'Expected sha256:<64 lowercase hex characters>');

const sha512IntegritySchema = z
   .string()
   .regex(/^sha512-[A-Za-z0-9+/]+={0,2}$/, 'Expected a SHA-512 Subresource Integrity string');

export const lockEntitySectionSchema = z.enum([
   'skills',
   'rules',
   'prompts',
   'mcp',
   'hooks',
   'editors',
   'aix',
]);

export const lockedFileSchema = z
   .object({
      path: z.string().min(1),
      digest: sha256DigestSchema,
      integrity: sha512IntegritySchema,
      size: z.number().int().nonnegative(),
   })
   .strict();

export const lockedEntitySchema = z
   .object({
      name: z.string().min(1),
      section: lockEntitySectionSchema,
      digest: sha256DigestSchema,
      integrity: sha512IntegritySchema,
      size: z.number().int().nonnegative(),
      source: z.unknown().optional(),
      resolved: z.record(z.unknown()).optional(),
      metadataDigest: sha256DigestSchema.optional(),
      files: z.array(lockedFileSchema).optional(),
   })
   .strict();

export const lockedEntitiesSchema = z
   .object({
      skills: z.record(lockedEntitySchema).default({}),
      rules: z.record(lockedEntitySchema).default({}),
      prompts: z.record(lockedEntitySchema).default({}),
      mcp: z.record(lockedEntitySchema).default({}),
      hooks: z.record(lockedEntitySchema).default({}),
      editors: z.record(lockedEntitySchema).default({}),
      aix: z.record(lockedEntitySchema).default({}),
   })
   .strict();

export const lockedConfigSchema = z
   .object({
      path: z.string().min(1),
      digest: sha256DigestSchema,
      integrity: sha512IntegritySchema,
      size: z.number().int().nonnegative(),
   })
   .strict();

export const aiLockFileSchema = z
   .object({
      $schema: z.string().url().optional(),
      lockfileVersion: z.literal(lockfileVersion),
      generatedBy: z.string().min(1),
      generatedAt: z.string().datetime({ offset: true }).optional(),
      config: lockedConfigSchema,
      entities: lockedEntitiesSchema,
   })
   .strict();

export type LockEntitySection = z.infer<typeof lockEntitySectionSchema>;
export type LockedFile = z.infer<typeof lockedFileSchema>;
export type LockedEntity = z.infer<typeof lockedEntitySchema>;
export type LockedEntities = z.infer<typeof lockedEntitiesSchema>;
export type LockedConfig = z.infer<typeof lockedConfigSchema>;
export type AiLockFile = z.infer<typeof aiLockFileSchema>;
