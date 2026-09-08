import { join, resolve } from 'pathe';
import type { PluginsConfig, McpServerConfig } from '@a1st/aix-schema';
import { parseJsonc } from '@a1st/aix-schema';
import type { PluginsStrategy } from '../types.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';

export interface UnpackedPluginComponents {
   skills: Record<string, { path: string }>;
   mcp: Record<string, McpServerConfig>;
   rules: Record<string, { content: string }>;
}

/**
 * Discovers and unpacks plugin components (skills, MCP servers, rules) from a local
 * plugin directory so editors without native plugin systems can consume them.
 */
export async function unpackPluginDirectory(
   pluginName: string,
   pluginDir: string,
): Promise<UnpackedPluginComponents> {
   const fs = getRuntimeAdapter().fs,
         result: UnpackedPluginComponents = {
            skills: {},
            mcp: {},
            rules: {},
         };

   try {
      if (!fs.existsSync(pluginDir)) {
         return result;
      }

      // 1. Discover skills: check <pluginDir>/skills or <pluginDir>/SKILL.md
      const skillsDir = join(pluginDir, 'skills'),
            rootSkillFile = join(pluginDir, 'SKILL.md');

      if (fs.existsSync(skillsDir)) {
         const entries = await fs.readdir(skillsDir, { withFileTypes: true });

         for (const entry of entries) {
            if (!entry.isDirectory()) {
               continue;
            }

            const skillSubdir = join(skillsDir, entry.name),
                  skillFile = join(skillSubdir, 'SKILL.md');

            if (fs.existsSync(skillFile)) {
               result.skills[`${pluginName}-${entry.name}`] = { path: skillSubdir };
            }
         }
      } else if (fs.existsSync(rootSkillFile)) {
         result.skills[pluginName] = { path: pluginDir };
      }

      // 2. Discover MCP servers: check <pluginDir>/.mcp.json or <pluginDir>/mcp.json
      const mcpCandidates = ['.mcp.json', 'mcp.json'],
            existingMcpFile = mcpCandidates.map((c) => join(pluginDir, c)).find((p) => fs.existsSync(p));

      if (existingMcpFile) {
         const raw = await fs.readFile(existingMcpFile, 'utf-8'),
               parsed = parseJsonc<Record<string, unknown>>(raw),
               servers = (parsed.data?.mcpServers ?? parsed.data?.servers ?? parsed.data) as Record<string, McpServerConfig> | undefined;

         for (const [serverName, serverConfig] of Object.entries(servers ?? {})) {
            if (typeof serverConfig === 'object' && serverConfig !== null) {
               result.mcp[`${pluginName}-${serverName}`] = serverConfig;
            }
         }
      }

      // 3. Discover rules: check <pluginDir>/rules/*.md
      const rulesDir = join(pluginDir, 'rules');

      if (fs.existsSync(rulesDir)) {
         const entries = await fs.readdir(rulesDir, { withFileTypes: true }),
               ruleEntries = entries.filter((e) => e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.mdc')));

         await Promise.all(
            ruleEntries.map(async (entry) => {
               const rulePath = join(rulesDir, entry.name),
                     content = await fs.readFile(rulePath, 'utf-8'),
                     ruleName = entry.name.replace(/\.(md|mdc)$/, '');

               result.rules[`${pluginName}-${ruleName}`] = { content };
            }),
         );
      }
   } catch {
      // Graceful fallback on unreadable directories
   }

   return result;
}

/**
 * Resolves local filesystem path for a plugin entry if applicable.
 */
function resolvePluginLocalPath(value: unknown, projectRoot: string): string | null {
   if (typeof value === 'string' && (value.startsWith('.') || value.startsWith('/'))) {
      return resolve(projectRoot, value);
   }

   if (typeof value !== 'object' || value === null) {
      return null;
   }

   const obj = value as { enabled?: boolean; source?: unknown };

   if (obj.enabled === false) {
      return null;
   }

   if (typeof obj.source === 'string' && (obj.source.startsWith('.') || obj.source.startsWith('/'))) {
      return resolve(projectRoot, obj.source);
   }

   if (
      typeof obj.source === 'object' &&
      obj.source !== null &&
      'path' in obj.source &&
      typeof (obj.source as { path?: unknown }).path === 'string'
   ) {
      return resolve(projectRoot, (obj.source as { path: string }).path);
   }

   return null;
}

/**
 * Unpacks all configured local plugins into their composite parts.
 */
export async function unpackAllPlugins(
   plugins: PluginsConfig,
   projectRoot: string,
): Promise<UnpackedPluginComponents> {
   const aggregated: UnpackedPluginComponents = {
      skills: {},
      mcp: {},
      rules: {},
   };

   const pluginTasks: Array<{ name: string; sourcePath: string }> = [];

   for (const [name, value] of Object.entries(plugins)) {
      if (value === false) {
         continue;
      }

      const sourcePath = resolvePluginLocalPath(value, projectRoot);

      if (sourcePath) {
         pluginTasks.push({ name, sourcePath });
      }
   }

   const unpackedList = await Promise.all(
      pluginTasks.map(({ name, sourcePath }) => unpackPluginDirectory(name, sourcePath)),
   );

   for (const unpacked of unpackedList) {
      Object.assign(aggregated.skills, unpacked.skills);
      Object.assign(aggregated.mcp, unpacked.mcp);
      Object.assign(aggregated.rules, unpacked.rules);
   }

   return aggregated;
}

/**
 * Compatibility plugins strategy for editors lacking native plugin systems
 * (e.g., Windsurf, Zed, Codex, Antigravity, Grok). Reports support as true
 * because components are unpacked into native skills, MCP, and rules.
 */
export class PluginCompatibilityStrategy implements PluginsStrategy {
   isSupported(): boolean {
      return true;
   }

   isCompatibility(): boolean {
      return true;
   }

   formatConfig(_plugins: PluginsConfig): string {
      return '';
   }

   getConfigPath(): string {
      return '';
   }

   getUnsupportedPlugins(_plugins: PluginsConfig): string[] {
      return [];
   }
}
