import { basename, dirname, join, resolve } from 'pathe';
import { modifyJsonc, parseJsonc, pluginNameSchema, type PluginsConfig, type PluginValue } from '@a1st/aix-schema';
import { getRuntimeAdapter } from '../../../runtime/index.js';
import { isRecord } from '../../../type-guards.js';
import type { PluginsStrategy } from '../types.js';
import { resolvePluginLocalPath } from '../shared/plugin-compatibility.js';

const CONFIG_PATH = '.gemini/config/plugins.json';
const MANIFEST_FILES = [ 'plugin.json', '.antigravity-plugin/plugin.json', '.gemini-plugin/plugin.json' ];

export function isNativeAntigravityPlugin(value: PluginValue): boolean {
   return isRecord(value) && value.enabled !== false && isRecord(value.editor)
      && isRecord(value.editor.antigravity) && value.editor.antigravity.native === true;
}

function readManifestName(path: string): string | undefined {
   const { fs } = getRuntimeAdapter(),
         manifest = MANIFEST_FILES.map((name) => join(path, name)).find((file) => fs.existsSync(file));

   if (!manifest) {
      return undefined;
   }
   try {
      const parsed = parseJsonc<Record<string, unknown>>(fs.readFileSync(manifest, 'utf-8'));

      return parsed.errors.length === 0 && typeof parsed.data?.name === 'string' ? parsed.data.name : undefined;
   } catch {
      return undefined;
   }
}

function getManifestPath(path: string): string {
   return resolve(getRuntimeAdapter().os.homedir(), dirname(CONFIG_PATH), path);
}

function getEntries(config: Record<string, unknown> | undefined | null): unknown[] {
   return Array.isArray(config?.entries) ? config.entries : [];
}

export class AntigravityPluginsStrategy implements PluginsStrategy {
   isSupported(): boolean {
      return true;
   }

   getConfigPath(): string {
      return '';
   }

   getGlobalConfigPath(): string {
      return CONFIG_PATH;
   }

   getUserRegistrations(plugins: PluginsConfig, configBaseDir: string): PluginsConfig {
      return Object.fromEntries(Object.entries(plugins).flatMap(([name, value]) => {
         if (!isNativeAntigravityPlugin(value)) {
            return [];
         }

         const path = resolvePluginLocalPath(value, configBaseDir);

         if (!path || readManifestName(path) !== name) {
            throw new Error(`Antigravity plugin "${name}" needs a local plugin manifest with a matching name.`);
         }
         return [[ name, { source: { path } } ]];
      }));
   }

   formatConfig(plugins: PluginsConfig): string {
      const entries = Object.values(plugins).flatMap((value) => {
         const path = resolvePluginLocalPath(value, getRuntimeAdapter().os.homedir());

         return path ? [{ path }] : [];
      });

      return JSON.stringify({ entries }, null, 2) + '\n';
   }

   mergeConfig(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
      if (existing.entries !== undefined && !Array.isArray(existing.entries)) {
         throw new Error('Antigravity plugin discovery entries must be an array');
      }

      const entries = getEntries(existing),
            registered = new Set(entries.flatMap((entry) => {
               return isRecord(entry) && typeof entry.path === 'string' ? [ getManifestPath(entry.path) ] : [];
            }));

      return { entries: [ ...entries, ...getEntries(incoming).filter((entry) => {
         return isRecord(entry) && typeof entry.path === 'string' && !registered.has(getManifestPath(entry.path));
      }) ] };
   }

   parseImportedConfig(content: string): { plugins: PluginsConfig; warnings: string[] } {
      const parsed = parseJsonc<Record<string, unknown>>(content),
            warnings = parsed.errors.map((error) => error.message),
            plugins = Object.fromEntries(getEntries(parsed.data).flatMap((entry) => {
               if (!isRecord(entry) || typeof entry.path !== 'string') {
                  return [];
               }
               const path = getManifestPath(entry.path),
                     name = readManifestName(path);

               if (!name || !pluginNameSchema.safeParse(name).success) {
                  return [];
               }
               return [[name, { source: { path }, editor: { antigravity: { native: true } } }]];
            }));

      return { plugins, warnings };
   }

   removeFromConfig(content: string, name: string): string | undefined {
      const parsed = parseJsonc<Record<string, unknown>>(content),
            entries = getEntries(parsed.data),
            index = entries.findIndex((entry) => {
               if (!isRecord(entry) || typeof entry.path !== 'string') {
                  return false;
               }
               const path = getManifestPath(entry.path);

               return (readManifestName(path) ?? basename(path)) === name;
            });

      return parsed.errors.length === 0 && index >= 0 ? modifyJsonc(content, [ 'entries', index ], undefined) : undefined;
   }
}
