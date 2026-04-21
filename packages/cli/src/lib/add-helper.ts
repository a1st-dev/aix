import { updateConfig, loadConfig, type EditorName } from '@a1st/aix-core';
import { McpRegistryClient, type ServerResponse, type Package } from '@a1st/mcp-registry-client';
import { normalizeEditors, resolveScope, type ConfigScope, type McpServerConfig } from '@a1st/aix-schema';
import { dirname } from 'pathe';
import { installAfterAdd } from './install-helper.js';
import { isValidSkillName, normalizeSkillName, parseSkillSource } from './skill-source.js';
import { computeFilesToDelete, deleteFiles } from './delete-helper.js';

export interface AddSkillOptions {
   configPath: string;
   name: string;
   source: string;
   ref?: string;
   skipInstall?: boolean;
}

export interface AddMcpOptions {
   configPath: string;
   name: string;
   skipInstall?: boolean;
}

export interface AddResult {
   success: boolean;
   name: string;
   error?: string;
}

/**
 * Add a skill to ai.json programmatically using aix-native source parsing.
 */
export async function addSkill(options: AddSkillOptions): Promise<AddResult> {
   const { configPath, source, skipInstall, name, ref } = options;

   try {
      const parsed = await parseSkillSource(source, ref),
            requestedName = name || parsed.inferredName,
            skillName = requestedName
               ? (isValidSkillName(requestedName) ? requestedName : normalizeSkillName(requestedName))
               : undefined;

      if (!skillName) {
         return {
            success: false,
            name: source,
            error: 'Could not infer skill name from source',
         };
      }

      await updateConfig(configPath, (config) => ({
         ...config,
         skills: {
            ...config.skills,
            [skillName]: parsed.value,
         },
      }));

      if (!skipInstall) {
         await installAfterAdd({
            configPath,
            sections: ['skills'],
         });
      }

      return { success: true, name: skillName };
   } catch (error) {
      return {
         success: false,
         name: name || source,
         error: error instanceof Error ? error.message : String(error),
      };
   }
}

/**
 * Find the first npm package with stdio transport from the packages array.
 */
function findNpmPackage(packages: Package[] | null | undefined): Package | undefined {
   if (!packages) {
      return undefined;
   }
   return packages.find((p) => p.registryType === 'npm' && p.transport.type === 'stdio');
}

/**
 * Build an MCP server config from a registry package.
 */
function buildConfigFromPackage(pkg: Package): McpServerConfig {
   const config: Record<string, unknown> = {
      command: `npx ${pkg.identifier}${pkg.version ? `@${pkg.version}` : ''}`,
   };

   if (pkg.environmentVariables && pkg.environmentVariables.length > 0) {
      const env: Record<string, string> = {};

      for (const envVar of pkg.environmentVariables) {
         if (envVar.default) {
            env[envVar.name] = envVar.default;
         } else if (envVar.isRequired) {
            env[envVar.name] = envVar.isSecret ? '<YOUR_SECRET>' : '<REQUIRED>';
         }
      }
      if (Object.keys(env).length > 0) {
         config.env = env;
      }
   }

   return config as McpServerConfig;
}

/**
 * Add an MCP server to ai.json programmatically by searching the MCP Registry.
 */
export async function addMcp(options: AddMcpOptions): Promise<AddResult> {
   const { configPath, name, skipInstall } = options;

   try {
      const client = new McpRegistryClient(),
            response = await client.search(name),
            results = response.servers ?? [];

      if (results.length === 0) {
         return {
            success: false,
            name,
            error: `No MCP servers found matching "${name}"`,
         };
      }

      // Use the first result
      const selected = results[0] as ServerResponse,
            pkg = findNpmPackage(selected.server.packages);

      if (!pkg) {
         return {
            success: false,
            name,
            error: `Server "${selected.server.name}" has no compatible npm package with stdio transport`,
         };
      }

      const serverConfig = buildConfigFromPackage(pkg),
            nameParts = selected.server.name.split('/'),
            friendlyName = nameParts[nameParts.length - 1] ?? selected.server.name;

      await updateConfig(configPath, (config) => ({
         ...config,
         mcp: {
            ...config.mcp,
            [friendlyName]: serverConfig,
         },
      }));

      if (!skipInstall) {
         await installAfterAdd({
            configPath,
            sections: ['mcp'],
         });
      }

      return { success: true, name: friendlyName };
   } catch (error) {
      return {
         success: false,
         name,
         error: error instanceof Error ? error.message : String(error),
      };
   }
}

/**
 * Find the config path by searching up from cwd.
 */
export async function findConfigPath(): Promise<string | null> {
   const loaded = await loadConfig({ startDir: process.cwd() });

   return loaded?.path ?? null;
}

export interface RemoveResult {
   success: boolean;
   name: string;
   error?: string;
}

async function cleanupRemovedSkill(
   configPath: string,
   name: string,
   scope: ConfigScope,
   editors: EditorName[],
): Promise<void> {
   if (editors.length === 0) {
      return;
   }

   const filesToDelete = computeFilesToDelete(editors, 'skill', name, {
      projectRoot: dirname(configPath),
      targetScope: scope,
   });

   await deleteFiles(filesToDelete);
   await installAfterAdd({
      configPath,
      sections: ['skills', 'rules'],
      scope,
      quiet: true,
   });
}

/**
 * Remove a skill from ai.json programmatically.
 */
export async function removeSkill(options: { configPath: string; name: string }): Promise<RemoveResult> {
   const { configPath, name } = options;

   try {
      const loaded = await loadConfig(configPath),
            scope = loaded ? resolveScope(loaded.config) : 'user',
            normalizedName = isValidSkillName(name) ? name : normalizeSkillName(name),
            editors = loaded?.config.editors
               ? (Object.keys(normalizeEditors(loaded.config.editors)) as EditorName[])
               : [];

      await updateConfig(configPath, (config) => {
         const keyToRemove =
                  config.skills?.[name] !== undefined
                     ? name
                     : config.skills?.[normalizedName] !== undefined
                        ? normalizedName
                        : name,
               { [keyToRemove]: _, ...remainingSkills } = config.skills ?? {};

         return { ...config, skills: remainingSkills };
      });

      await cleanupRemovedSkill(configPath, normalizedName, scope, editors);

      return { success: true, name: normalizedName };
   } catch (error) {
      return {
         success: false,
         name,
         error: error instanceof Error ? error.message : String(error),
      };
   }
}

/**
 * Remove an MCP server from ai.json programmatically.
 */
export async function removeMcp(options: { configPath: string; name: string }): Promise<RemoveResult> {
   const { configPath, name } = options;

   try {
      await updateConfig(configPath, (config) => {
         const { [name]: _, ...remainingMcp } = config.mcp ?? {};

         return { ...config, mcp: remainingMcp };
      });

      return { success: true, name };
   } catch (error) {
      return {
         success: false,
         name,
         error: error instanceof Error ? error.message : String(error),
      };
   }
}
