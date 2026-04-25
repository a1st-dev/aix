import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative } from 'pathe';
import {
   aiLockFileSchema,
   type AiJsonConfig,
   type AiLockFile,
   type LockedConfig,
   type LockedEntities,
   type LockedEntity,
   type LockedFile,
   normalizeEditors,
} from '@a1st/aix-schema';
import { loadPrompts } from './prompts/loader.js';
import { loadRules } from './rules/loader.js';
import { resolveAllSkills } from './skills/resolve.js';
import { ConfigParseError, type ConfigParseIssue } from './errors.js';
import {
   byteLength,
   canonicalJson,
   createEntitySnapshot,
   hashBytes,
   integrityForBytes,
} from './entity-hash.js';
import { getRuntimeAdapter } from './runtime/index.js';

export type LockfileMode = 'auto' | 'ignore';

export interface GenerateLockfileOptions {
   config: AiJsonConfig;
   configPath: string;
   configBaseDir?: string;
   projectRoot?: string;
   generatedBy?: string;
   generatedAt?: string;
}

export interface LockfileValidationResult {
   lockfilePath?: string;
   lockfile?: AiLockFile;
}

export interface LoadMatchingLockfileOptions {
   configPath: string;
   config: AiJsonConfig;
   configBaseDir?: string;
   projectRoot?: string;
   mode?: LockfileMode;
}

const LOCKFILE_NAME = 'ai.lock.json',
      LOCKFILE_SCHEMA_URL = 'https://a1st.dev/aix/schemas/ai-lock.schema.json';

export function getLockfilePath(configPath: string): string | undefined {
   if (basename(configPath) !== 'ai.json') {
      return undefined;
   }

   return join(dirname(configPath), LOCKFILE_NAME);
}

export async function readLockfile(lockfilePath: string): Promise<AiLockFile> {
   let raw: string,
       parsed: unknown;

   try {
      raw = await getRuntimeAdapter().fs.readFile(lockfilePath, 'utf-8');
      parsed = JSON.parse(raw);
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      throw new ConfigParseError(message, lockfilePath);
   }

   try {
      return aiLockFileSchema.parse(parsed);
   } catch (error) {
      if (error instanceof Error && 'issues' in error) {
         const issues = error.issues as Array<{ path: (string | number)[]; message: string }>;

         throw new ConfigParseError(
            'Validation failed',
            lockfilePath,
            issues.map((issue) => ({
               path: issue.path.join('.'),
               message: issue.message,
            })),
         );
      }
      throw error;
   }
}

export async function writeLockfile(lockfilePath: string, lockfile: AiLockFile): Promise<void> {
   await getRuntimeAdapter().fs.writeFile(lockfilePath, `${JSON.stringify(lockfile, null, 3)}\n`, 'utf-8');
}

export async function loadMatchingLockfile(options: LoadMatchingLockfileOptions): Promise<LockfileValidationResult> {
   const {
      configPath,
      config,
      configBaseDir = dirname(configPath),
      projectRoot = configBaseDir,
      mode = 'auto',
   } = options;
   const lockfilePath = getLockfilePath(configPath);

   if (!lockfilePath || mode === 'ignore' || !getRuntimeAdapter().fs.existsSync(lockfilePath)) {
      return {};
   }

   const lockfile = await readLockfile(lockfilePath),
         expectedConfig = createLockedConfig(configPath, config);

   if (lockfile.config.digest !== expectedConfig.digest) {
      throw createStaleLockfileError(lockfilePath, [{
         path: 'config.digest',
         message: `Expected ${expectedConfig.digest}, found ${lockfile.config.digest}`,
      }]);
   }

   const expectedEntities = await createLockedEntities(config, configBaseDir, projectRoot),
         issues = compareLockedEntities(lockfile.entities, expectedEntities);

   if (issues.length > 0) {
      throw createStaleLockfileError(lockfilePath, issues);
   }

   return { lockfilePath, lockfile };
}

export async function generateLockfile(options: GenerateLockfileOptions): Promise<AiLockFile> {
   const configBaseDir = options.configBaseDir ?? dirname(options.configPath),
         projectRoot = options.projectRoot ?? configBaseDir,
         config = createLockedConfig(options.configPath, options.config),
         entities = await createLockedEntities(options.config, configBaseDir, projectRoot);

   return {
      $schema: LOCKFILE_SCHEMA_URL,
      lockfileVersion: 1,
      generatedBy: options.generatedBy ?? 'aix',
      ...(options.generatedAt && { generatedAt: options.generatedAt }),
      config,
      entities,
   };
}

export async function generateAndWriteLockfile(options: GenerateLockfileOptions): Promise<{
   lockfilePath: string;
   lockfile: AiLockFile;
}> {
   const lockfilePath = getLockfilePath(options.configPath);

   if (!lockfilePath) {
      throw new Error('Lockfiles can only be written for ai.json files.');
   }

   const lockfile = await generateLockfile(options);

   await writeLockfile(lockfilePath, lockfile);

   return { lockfilePath, lockfile };
}

function createLockedConfig(configPath: string, config: AiJsonConfig): LockedConfig {
   const content = canonicalJson(config);

   return {
      path: basename(configPath),
      digest: hashBytes(content),
      integrity: integrityForBytes(content),
      size: byteLength(content),
   };
}

async function createLockedEntities(
   config: AiJsonConfig,
   configBaseDir: string,
   projectRoot: string,
): Promise<LockedEntities> {
   const basePath = join(configBaseDir, 'ai.json'),
         entities: LockedEntities = {
            skills: {},
            rules: {},
            prompts: {},
            mcp: {},
            hooks: {},
            editors: {},
            aix: {},
         };

   await addSkillEntities(entities, config, configBaseDir, projectRoot);
   await addRuleEntities(entities, config, basePath);
   await addPromptEntities(entities, config, basePath);
   addStructuredEntities(entities, 'mcp', config.mcp ?? {});
   addStructuredEntities(entities, 'hooks', config.hooks ?? {});

   if (config.editors) {
      addStructuredEntities(entities, 'editors', normalizeEditors(config.editors));
   }
   if (config.aix) {
      entities.aix.settings = createStructuredEntity('aix', 'settings', config.aix);
   }

   return entities;
}

async function addSkillEntities(
   entities: LockedEntities,
   config: AiJsonConfig,
   configBaseDir: string,
   projectRoot: string,
): Promise<void> {
   if (Object.keys(config.skills ?? {}).length === 0) {
      return;
   }

   const skills = await resolveAllSkills(config.skills, {
      baseDir: configBaseDir,
      projectRoot,
   });

   const entries = await Promise.all(
      [...skills.entries()].toSorted(([a], [b]) => a.localeCompare(b)).map(async ([name, skill]) => {
         const files = await listLockedFiles(skill.basePath);

         return [name, createEntitySnapshot({
            name,
            section: 'skills',
            content: canonicalJson(files),
            files,
            source: config.skills[name],
            resolved: {
               source: skill.source,
               basePath: normalizeResolvedPath(skill.basePath, configBaseDir),
            },
            metadata: skill.frontmatter,
         })] as const;
      }),
   );

   for (const [name, entity] of entries) {
      entities.skills[name] = entity;
   }
}

async function addRuleEntities(
   entities: LockedEntities,
   config: AiJsonConfig,
   basePath: string,
): Promise<void> {
   if (Object.keys(config.rules ?? {}).length === 0) {
      return;
   }

   const rules = await loadRules(config.rules, basePath);

   for (const name of Object.keys(rules).toSorted()) {
      const rule = rules[name];

      if (!rule) {
         continue;
      }

      entities.rules[name] = createEntitySnapshot({
         name,
         section: 'rules',
         content: rule.content,
         source: config.rules[name],
         resolved: rule.sourcePath ? { sourcePath: normalizeResolvedPath(rule.sourcePath, dirname(basePath)) } : { source: rule.source },
         metadata: rule.metadata,
      });
   }
}

async function addPromptEntities(
   entities: LockedEntities,
   config: AiJsonConfig,
   basePath: string,
): Promise<void> {
   if (Object.keys(config.prompts ?? {}).length === 0) {
      return;
   }

   const prompts = await loadPrompts(config.prompts, basePath);

   for (const name of Object.keys(prompts).toSorted()) {
      const prompt = prompts[name];

      if (!prompt) {
         continue;
      }

      entities.prompts[name] = createEntitySnapshot({
         name,
         section: 'prompts',
         content: prompt.content,
         source: config.prompts[name],
         resolved: prompt.sourcePath ? { sourcePath: normalizeResolvedPath(prompt.sourcePath, dirname(basePath)) } : undefined,
         metadata: {
            argumentHint: prompt.argumentHint,
            description: prompt.description,
         },
      });
   }
}

function addStructuredEntities(
   entities: LockedEntities,
   section: 'mcp' | 'hooks' | 'editors',
   values: Record<string, unknown>,
): void {
   for (const name of Object.keys(values).toSorted()) {
      const value = values[name];

      if (value === undefined || value === false) {
         continue;
      }

      entities[section][name] = createStructuredEntity(section, name, value);
   }
}

function createStructuredEntity(section: 'mcp' | 'hooks' | 'editors' | 'aix', name: string, value: unknown): LockedEntity {
   const content = canonicalJson(value);

   return createEntitySnapshot({
      name,
      section,
      content,
      source: value,
   });
}

async function listLockedFiles(root: string, current: string = root): Promise<LockedFile[]> {
   const entries = await getRuntimeAdapter().fs.readdir(current, { withFileTypes: true }),
         files = await Promise.all(
            entries.toSorted((a, b) => a.name.localeCompare(b.name)).map(async (entry) => {
               const absolutePath = join(current, entry.name),
                     relativePath = relative(root, absolutePath);

               if (entry.isDirectory()) {
                  return listLockedFiles(root, absolutePath);
               }

               if (entry.isSymbolicLink()) {
                  const target = await getRuntimeAdapter().fs.readlink(absolutePath),
                        content = `symlink:${target}`;

                  return [{
                     path: relativePath,
                     digest: hashBytes(content),
                     integrity: integrityForBytes(content),
                     size: byteLength(content),
                  }];
               }

               if (!entry.isFile()) {
                  return [];
               }

               const content = await readFile(absolutePath);

               return [{
                  path: relativePath,
                  digest: hashBytes(content),
                  integrity: integrityForBytes(content),
                  size: byteLength(content),
               }];
            }),
         );

   return files.flat();
}

function compareLockedEntities(
   locked: LockedEntities,
   expected: LockedEntities,
): ConfigParseIssue[] {
   const issues: ConfigParseIssue[] = [],
         sections = ['skills', 'rules', 'prompts', 'mcp', 'hooks', 'editors', 'aix'] as const;

   for (const section of sections) {
      const lockedSection = locked[section],
            expectedSection = expected[section],
            names = [...new Set([...Object.keys(lockedSection), ...Object.keys(expectedSection)])].toSorted();

      for (const name of names) {
         const lockedEntity = lockedSection[name],
               expectedEntity = expectedSection[name],
               path = `entities.${section}.${name}`;

         if (!lockedEntity && expectedEntity) {
            issues.push({
               path,
               message: 'Missing from ai.lock.json',
            });
            continue;
         }
         if (lockedEntity && !expectedEntity) {
            issues.push({
               path,
               message: 'No longer present in resolved ai.json',
            });
            continue;
         }
         if (lockedEntity && expectedEntity && lockedEntity.digest !== expectedEntity.digest) {
            issues.push({
               path: `${path}.digest`,
               message: `Expected ${expectedEntity.digest}, found ${lockedEntity.digest}`,
            });
         }
      }
   }

   return issues;
}

function createStaleLockfileError(lockfilePath: string, issues: ConfigParseIssue[]): ConfigParseError {
   return new ConfigParseError(
      'ai.lock.json is stale. Run `aix validate --lock` or the command you were using with `--lock` to refresh it.',
      lockfilePath,
      issues,
   );
}

function normalizeResolvedPath(path: string, baseDir: string): string {
   const relativePath = relative(baseDir, path);

   if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
      return relativePath || '.';
   }

   return path;
}
