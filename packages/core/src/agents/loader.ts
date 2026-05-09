import { resolve, dirname } from 'pathe';
import type { AgentObject, AgentValue, AgentsConfig } from '@a1st/aix-schema';
import { normalizeSourceRef } from '@a1st/aix-schema';
import { getAgentsCacheDir } from '../cache/paths.js';
import { loadFromGit } from '../git-loader.js';
import { resolveNpmPath } from '../npm/resolve.js';
import { parseAgentFrontmatter } from './parser.js';
import { getRuntimeAdapter } from '../runtime/index.js';

export interface LoadedAgent {
   name: string;
   content: string;
   description?: string;
   mode?: 'primary' | 'subagent';
   model?: string;
   tools?: string[];
   permissions?: Record<string, 'allow' | 'ask' | 'deny'>;
   mcp?: AgentObject['mcp'];
   editor?: AgentObject['editor'];
   sourcePath?: string;
}

export async function loadAgent(
   name: string,
   value: AgentValue,
   basePath: string,
): Promise<LoadedAgent> {
   const agentObj: AgentObject = typeof value === 'string' ? normalizeSourceRef(value) : value,
         base = {
            name,
            description: agentObj.description,
            mode: agentObj.mode,
            model: agentObj.model,
            tools: agentObj.tools,
            permissions: agentObj.permissions,
            mcp: agentObj.mcp,
            editor: agentObj.editor,
         };

   if (agentObj.content) {
      return {
         ...base,
         content: agentObj.content,
      };
   }

   if (agentObj.path) {
      const fullPath = resolve(dirname(basePath), agentObj.path),
            rawContent = await getRuntimeAdapter().fs.readFile(fullPath, 'utf-8'),
            parsed = parseAgentFrontmatter(rawContent.trim());

      return {
         ...base,
         description: base.description ?? parsed.description,
         mode: base.mode ?? parsed.mode,
         model: base.model ?? parsed.model,
         tools: base.tools ?? parsed.tools,
         permissions: base.permissions ?? parsed.permissions,
         mcp: base.mcp ?? parsed.mcp,
         editor: base.editor ?? parsed.editor,
         content: parsed.content,
         sourcePath: fullPath,
      };
   }

   if (agentObj.git) {
      const baseDir = dirname(basePath) || getRuntimeAdapter().os.tmpdir(),
            result = await loadFromGit({
               git: agentObj.git,
               cacheDir: getAgentsCacheDir(baseDir),
               defaultFilePath: 'agent.md',
            }),
            parsed = parseAgentFrontmatter(result.content);

      return {
         ...base,
         description: base.description ?? parsed.description,
         mode: base.mode ?? parsed.mode,
         model: base.model ?? parsed.model,
         tools: base.tools ?? parsed.tools,
         permissions: base.permissions ?? parsed.permissions,
         mcp: base.mcp ?? parsed.mcp,
         editor: base.editor ?? parsed.editor,
         content: parsed.content,
         sourcePath: result.sourcePath,
      };
   }

   if (agentObj.npm) {
      const filePath = await resolveNpmPath({
               packageName: agentObj.npm.npm,
               subpath: agentObj.npm.path,
               version: agentObj.npm.version,
               projectRoot: dirname(basePath),
            }),
            rawContent = await getRuntimeAdapter().fs.readFile(filePath, 'utf-8'),
            parsed = parseAgentFrontmatter(rawContent.trim());

      return {
         ...base,
         description: base.description ?? parsed.description,
         mode: base.mode ?? parsed.mode,
         model: base.model ?? parsed.model,
         tools: base.tools ?? parsed.tools,
         permissions: base.permissions ?? parsed.permissions,
         mcp: base.mcp ?? parsed.mcp,
         editor: base.editor ?? parsed.editor,
         content: parsed.content,
         sourcePath: filePath,
      };
   }

   throw new Error(`Invalid agent "${name}": no content source found`);
}

export async function loadAgents(
   agents: AgentsConfig,
   basePath: string,
): Promise<Record<string, LoadedAgent>> {
   const entries = Object.entries(agents).filter(([, value]) => value !== false),
         loadedEntries = await Promise.all(
            entries.map(async ([name, value]) => {
               const loaded = await loadAgent(name, value as Exclude<typeof value, false>, basePath);

               return [name, loaded] as const;
            }),
         );

   return Object.fromEntries(loadedEntries);
}
