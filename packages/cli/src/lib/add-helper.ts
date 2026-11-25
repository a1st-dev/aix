import { detectEditors, loadConfig, removeMcpFromEditors, updateConfig, type EditorName } from '@a1st/aix-core';
import { McpRegistryClient, type ServerResponse } from '@a1st/mcp-registry-client';
import { normalizeEditors, type ConfigScope } from '@a1st/aix-schema';
import { dirname } from 'pathe';
import { resolveTargetScope } from '../flags/scope.js';
import { installAfterAdd } from './install-helper.js';
import { isValidSkillName, normalizeSkillName, parseSkillSource } from './skill-source.js';
import { deleteFiles, findFilesToDelete } from './delete-helper.js';
import { buildMcpServerConfig, findCompatibleNpmPackage } from './add-command-helper.js';

export interface AddSkillOptions {
   configPath: string;
   name: string;
   source: string;
   ref?: string;
   skipInstall?: boolean;
}

export interface AddMcpOptions {
   configPath: string;
   /** Text to search the registry for. */
   name: string;
   /** Registry name of the server to add. Without it, the first search result is used. */
   serverName?: string;
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

      const installError = skipInstall ? undefined : await installAddedSection(configPath, 'skills');

      if (installError) {
         return { success: false, name: skillName, error: installError };
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
 * Install one section after an item was saved to it. Returns what went wrong, so the caller
 * does not report an item as installed when no editor received it.
 */
async function installAddedSection(configPath: string, section: 'skills' | 'mcp'): Promise<string | undefined> {
   const installed = await installAfterAdd({ configPath, sections: [ section ] }),
         failures = installed.results.filter((result) => {
            return !result.success;
         });

   if (!installed.installed) {
      return 'Saved to ai.json, but no editor was found to install to';
   }

   return failures.length === 0 ? undefined : failures.map((failure) => {
      return `${failure.editor}: ${failure.errors.join(', ')}`;
   }).join('; ');
}

/**
 * Add an MCP server to ai.json programmatically by searching the MCP Registry.
 */
export async function addMcp(options: AddMcpOptions): Promise<AddResult> {
   const { configPath, name, serverName, skipInstall } = options;

   try {
      const client = new McpRegistryClient(),
            response = await client.search(serverName ?? name),
            results: ServerResponse[] = response.servers ?? [],
            selected = serverName
               ? results.find((result) => {
                  return result.server.name === serverName;
               })
               : results[0];

      if (!selected) {
         return {
            success: false,
            name,
            error: `No MCP servers found matching "${serverName ?? name}"`,
         };
      }

      const pkg = findCompatibleNpmPackage(selected.server.packages);

      if (!pkg) {
         return {
            success: false,
            name,
            error: `Server "${selected.server.name}" has no compatible npm package with stdio transport`,
         };
      }

      const serverConfig = buildMcpServerConfig(pkg),
            nameParts = selected.server.name.split('/'),
            friendlyName = nameParts[nameParts.length - 1] ?? selected.server.name;

      await updateConfig(configPath, (config) => ({
         ...config,
         mcp: {
            ...config.mcp,
            [friendlyName]: serverConfig,
         },
      }));

      const installError = skipInstall ? undefined : await installAddedSection(configPath, 'mcp');

      if (installError) {
         return { success: false, name: friendlyName, error: installError };
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

   const filesToDelete = await findFilesToDelete({
      editors,
      section: 'skills',
      name,
      scope,
      projectRoot: dirname(configPath),
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
            scope = resolveTargetScope({}, loaded?.config),
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
      const loaded = await loadConfig(configPath),
            projectRoot = dirname(configPath),
            configuredEditors = loaded?.config.editors ? Object.keys(normalizeEditors(loaded.config.editors)) : [],
            editors = configuredEditors.length > 0 ? configuredEditors : await detectEditors(projectRoot);

      await updateConfig(configPath, (config) => {
         const { [name]: _, ...remainingMcp } = config.mcp ?? {};

         return { ...config, mcp: remainingMcp };
      });

      // The entry in ai.json is only half of it: the editors still have the server.
      const removals = await removeMcpFromEditors(editors, name, projectRoot, {
               targetScope: resolveTargetScope({}, loaded?.config),
            }),
            failures = removals.filter((removal) => {
               return !removal.success;
            });

      if (failures.length > 0) {
         return {
            success: false,
            name,
            error: failures.map((failure) => {
               return `${failure.editor}: ${failure.errors.join(', ')}`;
            }).join('; '),
         };
      }

      return { success: true, name };
   } catch (error) {
      return {
         success: false,
         name,
         error: error instanceof Error ? error.message : String(error),
      };
   }
}
