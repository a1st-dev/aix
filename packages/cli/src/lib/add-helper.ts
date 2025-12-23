import { updateConfig, loadConfig } from '@a1st/aix-core';
import { McpRegistryClient, type ServerResponse, type Package } from '@a1st/mcp-registry-client';
import type { McpServerConfig } from '@a1st/aix-schema';
import { installAfterAdd } from './install-helper.js';

export interface AddSkillOptions {
   configPath: string;
   name: string;
   source: string;
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
 * Normalize a string to a valid skill name (lowercase alphanumeric with hyphens).
 */
function normalizeSkillName(name: string): string {
   return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
}

/**
 * Add a skill to ai.json programmatically.
 * For npm packages, the source should be the package name (e.g., "aix-skill-typescript" or just "typescript").
 */
export async function addSkill(options: AddSkillOptions): Promise<AddResult> {
   const { configPath, source, skipInstall } = options;

   try {
      // Determine if it's a short name or full package name
      const isFullPkgName = source.startsWith('aix-skill-') || source.startsWith('@'),
            packageName = isFullPkgName ? source : `aix-skill-${source}`,
            skillName = options.name || normalizeSkillName(source.replace(/^aix-skill-/, ''));

      await updateConfig(configPath, (config) => ({
         ...config,
         skills: {
            ...config.skills,
            [skillName]: packageName,
         },
      }));

      if (!skipInstall) {
         await installAfterAdd({
            configPath,
            scopes: ['skills'],
         });
      }

      return { success: true, name: skillName };
   } catch (error) {
      return {
         success: false,
         name: options.name || source,
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
            scopes: ['mcp'],
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

/**
 * Remove a skill from ai.json programmatically.
 */
export async function removeSkill(options: { configPath: string; name: string }): Promise<RemoveResult> {
   const { configPath, name } = options;

   try {
      await updateConfig(configPath, (config) => {
         const { [name]: _, ...remainingSkills } = config.skills ?? {};

         return { ...config, skills: remainingSkills };
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
