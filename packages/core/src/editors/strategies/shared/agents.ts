import { join, basename } from 'pathe';
import type { EditorAgent } from '../../types.js';
import type { AgentsStrategy, ImportedAgentsResult } from '../types.js';
import { parseAgentFrontmatter } from '../../../agents/parser.js';
import { quoteYamlString } from '../../../frontmatter-utils.js';
import { getRuntimeAdapter } from '../../../runtime/index.js';

export interface MarkdownAgentsConfig {
   projectAgentsDir: string | string[];
   userAgentsDir: string | string[] | null;
   extraFrontmatter?: (agent: EditorAgent) => Record<string, unknown>;
   toolsKey?: string | null;
   permissionsKey?: string;
   mcpKey?: string;
}

function yamlValue(value: unknown): string {
   if (typeof value === 'string') {
      return quoteYamlString(value);
   }

   return JSON.stringify(value);
}

function formatList(name: string, values: readonly string[] | undefined): string[] {
   if (!values || values.length === 0) {
      return [];
   }

   return [`${name}:`, ...values.map((value) => `  - ${quoteYamlString(value)}`)];
}

function formatRecord(name: string, value: Record<string, unknown> | undefined): string[] {
   if (!value || Object.keys(value).length === 0) {
      return [];
   }

   return [
      `${name}:`,
      ...JSON.stringify(value, null, 2)
         .split('\n')
         .map((line) => `  ${line}`),
   ];
}

function formatFrontmatter(agent: EditorAgent, config: MarkdownAgentsConfig): string {
   const extra = config.extraFrontmatter?.(agent) ?? {},
         toolsKey = config.toolsKey === undefined ? 'tools' : config.toolsKey,
         permissionsKey = config.permissionsKey ?? 'permissions',
         mcpKey = config.mcpKey ?? 'mcp';
   const lines = [
      `name: ${quoteYamlString(agent.name)}`,
      ...(agent.description ? [`description: ${quoteYamlString(agent.description)}`] : []),
      ...(agent.mode ? [`mode: ${quoteYamlString(agent.mode)}`] : []),
      ...(agent.model ? [`model: ${quoteYamlString(agent.model)}`] : []),
      ...(toolsKey ? formatList(toolsKey, agent.tools) : []),
      ...formatRecord(permissionsKey, agent.permissions),
      ...formatRecord(mcpKey, agent.mcp),
      ...Object.entries(extra).map(([key, value]) => `${key}: ${yamlValue(value)}`),
   ];

   return `--- \n${lines.join('\n')}\n---\n\n${agent.content.trim()}\n`;
}

async function importAgentsFromDir(dir: string, scope: 'project' | 'user', strategy: AgentsStrategy): Promise<ImportedAgentsResult> {
   try {
      const files = await getRuntimeAdapter().fs.readdir(dir),
            markdownFiles = files.filter((file) => file.endsWith('.md')),
            entries = await Promise.all(
               markdownFiles.map(async (file) => {
                  const path = join(dir, file),
                        content = await getRuntimeAdapter().fs.readFile(path, 'utf-8'),
                        name = basename(file, '.md'),
                        agent = strategy.parseAgent(name, content);

                  return { name: agent.name || name, path, agent };
               }),
            );

      return {
         agents: Object.fromEntries(entries.map((entry) => [entry.name, entry.agent])),
         paths: Object.fromEntries(entries.map((entry) => [entry.name, entry.path])),
         scopes: Object.fromEntries(entries.map((entry) => [entry.name, scope])),
         warnings: [],
      };
   } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
         return { agents: {}, paths: {}, scopes: {}, warnings: [] };
      }

      return {
         agents: {},
         paths: {},
         scopes: {},
         warnings: [`Failed to read agents from ${dir}: ${(err as Error).message}`],
      };
   }
}

export class MarkdownAgentsStrategy implements AgentsStrategy {
   private readonly projectAgentsDirs: string[];
   private readonly userAgentsDirs: string[] | null;

   constructor(private readonly config: MarkdownAgentsConfig) {
      const projectDir = config.projectAgentsDir;

      this.projectAgentsDirs = Array.isArray(projectDir) ? projectDir : [projectDir];
      const userDir = config.userAgentsDir;

      this.userAgentsDirs = userDir === null ? null : (Array.isArray(userDir) ? userDir : [userDir]);
   }

   isSupported(): boolean {
      return true;
   }

   formatAgent(agent: EditorAgent): string {
      return formatFrontmatter(agent, this.config);
   }

   getAgentsDir(): string {
      return this.projectAgentsDirs[0]!;
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalAgentsPath(): string | null {
      return this.userAgentsDirs?.[0] ?? null;
   }

   parseAgent(sourceName: string, content: string): EditorAgent {
      const parsed = parseAgentFrontmatter(content),
            name = parsed.rawFrontmatter && typeof parsed.rawFrontmatter.name === 'string'
               ? parsed.rawFrontmatter.name
               : sourceName;

      return {
         name,
         content: parsed.content,
         description: parsed.description,
         mode: parsed.mode,
         model: parsed.model,
         tools: parsed.tools,
         permissions: parsed.permissions,
         mcp: parsed.mcp,
         editor: parsed.editor,
      };
   }

   async importGlobalAgents(): Promise<ImportedAgentsResult> {
      if (!this.userAgentsDirs) {
         return { agents: {}, paths: {}, scopes: {}, warnings: [] };
      }

      let combinedResult: ImportedAgentsResult = { agents: {}, paths: {}, scopes: {}, warnings: [] };

      // Reverse order so plural (first in config) overwrites singular in the final map
      for (const dir of this.userAgentsDirs.toReversed()) {
         // eslint-disable-next-line no-await-in-loop -- Sequential fallback
         const result = await importAgentsFromDir(join(getRuntimeAdapter().os.homedir(), dir), 'user', this);

         combinedResult = mergeAgentImports(combinedResult, result);
      }

      return combinedResult;
   }

   async importProjectAgents(projectRoot: string, editorConfigDir: string): Promise<ImportedAgentsResult> {
      let combinedResult: ImportedAgentsResult = { agents: {}, paths: {}, scopes: {}, warnings: [] };

      for (const dir of this.projectAgentsDirs.toReversed()) {
         // eslint-disable-next-line no-await-in-loop -- Sequential fallback
         const result = await importAgentsFromDir(join(projectRoot, editorConfigDir, dir), 'project', this);

         combinedResult = mergeAgentImports(combinedResult, result);
      }

      return combinedResult;
   }
}

export class NoAgentsStrategy implements AgentsStrategy {
   isSupported(): boolean {
      return false;
   }

   formatAgent(_agent: EditorAgent): string {
      return '';
   }

   getAgentsDir(): string {
      return 'agents';
   }

   getFileExtension(): string {
      return '.md';
   }

   getGlobalAgentsPath(): string | null {
      return null;
   }

   parseAgent(name: string, content: string): EditorAgent {
      return { name, content };
   }
}

function mergeAgentImports(
   base: ImportedAgentsResult,
   overlay: ImportedAgentsResult,
): ImportedAgentsResult {
   return {
      agents: { ...base.agents, ...overlay.agents },
      paths: { ...base.paths, ...overlay.paths },
      scopes: { ...base.scopes, ...overlay.scopes },
      warnings: [...base.warnings, ...overlay.warnings],
   };
}
