import { describe, it, expect } from 'vitest';
import { mergeConfigs, filterConfigByScopes, type ConfigScope } from '../merge.js';
import { getTransport } from '../mcp/normalize.js';
import type { AiJsonConfig, McpServerConfig } from '@a1st/aix-schema';

/**
 * Helper to create a minimal MCP server config for tests.
 */
function mcpServer(command: string, args?: string[]): McpServerConfig {
   const config: Record<string, unknown> = { command };

   if (args && args.length > 0) {
      config.args = args;
   }
   return config as McpServerConfig;
}

describe('mergeConfigs', () => {
   const emptyConfig: AiJsonConfig = {
      skills: {},
      mcp: {},
      rules: {},
      prompts: {},
   };

   describe('with empty local', () => {
      it('returns remote config when local is empty', () => {
         const remote: Partial<AiJsonConfig> = {
            skills: {
               pdf: { git: 'https://github.com/test/skills', path: 'skills/pdf' },
            },
            mcp: {
               playwright: mcpServer('npx', ['-y', '@playwright/mcp']),
            },
         };

         const result = mergeConfigs(emptyConfig, remote);

         expect(result.skills).toEqual(remote.skills);
         expect(result.mcp).toEqual(remote.mcp);
      });
   });

   describe('with empty remote', () => {
      it('preserves local config when remote is empty', () => {
         const local: AiJsonConfig = {
            skills: {
               pdf: { git: 'https://github.com/test/skills', path: 'skills/pdf' },
            },
            mcp: {
               playwright: mcpServer('npx', ['-y', '@playwright/mcp']),
            },
            rules: {},
            prompts: {},
         };

         const result = mergeConfigs(local, {});

         expect(result).toEqual(local);
      });
   });

   describe('skills merge', () => {
      it('remote wins on key conflict', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            skills: {
               pdf: { git: 'https://github.com/local/skills', path: 'local/pdf' },
               'local-only': { git: 'https://github.com/local/skills', path: 'local-only' },
            },
         };

         const remote: Partial<AiJsonConfig> = {
            skills: {
               pdf: { git: 'https://github.com/remote/skills', path: 'remote/pdf' },
               'remote-only': { git: 'https://github.com/remote/skills', path: 'remote-only' },
            },
         };

         const result = mergeConfigs(local, remote);

         expect(result.skills?.pdf).toEqual(remote.skills?.pdf);
         expect(result.skills?.['local-only']).toEqual(local.skills?.['local-only']);
         expect(result.skills?.['remote-only']).toEqual(remote.skills?.['remote-only']);
      });
   });

   describe('mcp merge', () => {
      it('remote wins on key conflict', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            mcp: {
               playwright: mcpServer('local-cmd'),
               'local-server': mcpServer('local-only'),
            },
         };

         const remote: Partial<AiJsonConfig> = {
            mcp: {
               playwright: mcpServer('remote-cmd', ['--new']),
               'remote-server': mcpServer('remote-only'),
            },
         };

         const result = mergeConfigs(local, remote);

         const resultPlaywright = result.mcp!.playwright,
               remotePlaywright = remote.mcp!.playwright;

         expect(resultPlaywright).toBeDefined();
         expect(resultPlaywright).not.toBe(false);
         expect(remotePlaywright).toBeDefined();
         expect(remotePlaywright).not.toBe(false);
         // Type narrowing: after the checks above, we know these are valid configs
         expect(getTransport(resultPlaywright as McpServerConfig)).toEqual(
            getTransport(remotePlaywright as McpServerConfig),
         );
         expect(result.mcp?.['local-server']).toEqual(local.mcp?.['local-server']);
         expect(result.mcp?.['remote-server']).toEqual(remote.mcp?.['remote-server']);
      });
   });

   describe('rules merge', () => {
      it('merges rules with key-level replacement (remote wins on conflict)', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            rules: {
               'local-rule-1': { content: 'local rule 1' },
               'shared-rule': { content: 'local shared content' },
            },
         };

         const remote: Partial<AiJsonConfig> = {
            rules: {
               'remote-rule-1': { content: 'remote rule 1' },
               'shared-rule': { content: 'remote shared content' },
            },
         };

         const result = mergeConfigs(local, remote);

         expect(Object.keys(result.rules ?? {})).toHaveLength(3);
         expect(result.rules?.['local-rule-1']).toEqual({ content: 'local rule 1' });
         expect(result.rules?.['remote-rule-1']).toEqual({ content: 'remote rule 1' });
         expect(result.rules?.['shared-rule']).toEqual({ content: 'remote shared content' });
      });
   });

   describe('prompts merge', () => {
      it('merges prompts with key-level replacement (remote wins on conflict)', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            prompts: {
               'add-feature': { content: 'local add-feature content' },
               'local-only': { content: 'local-only content' },
            },
         };

         const remote: Partial<AiJsonConfig> = {
            prompts: {
               'add-feature': { content: 'remote add-feature content' },
               'remote-only': { content: 'remote-only content' },
            },
         };

         const result = mergeConfigs(local, remote);

         expect(Object.keys(result.prompts ?? {})).toHaveLength(3);
         expect(result.prompts?.['add-feature']).toEqual({ content: 'remote add-feature content' });
         expect(result.prompts?.['local-only']).toEqual({ content: 'local-only content' });
         expect(result.prompts?.['remote-only']).toEqual({ content: 'remote-only content' });
      });
   });

   describe('editors merge', () => {
      it('remote wins on key conflict', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            editors: {
               windsurf: { enabled: true },
               cursor: { enabled: false },
            },
         };

         const remote: Partial<AiJsonConfig> = {
            editors: {
               windsurf: { enabled: false },
               vscode: { enabled: true },
            },
         };

         const result = mergeConfigs(local, remote);

         expect(result.editors).toEqual({
            windsurf: { enabled: false },
            cursor: { enabled: false },
            vscode: { enabled: true },
         });
      });

      it('handles array form editors', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            editors: ['windsurf', 'cursor'],
         };

         const remote: Partial<AiJsonConfig> = {
            editors: {
               vscode: { enabled: true },
            },
         };

         const result = mergeConfigs(local, remote);

         expect(result.editors).toEqual({
            windsurf: { enabled: true },
            cursor: { enabled: true },
            vscode: { enabled: true },
         });
      });
   });

   describe('metadata fields', () => {
      it('remote wins for $schema', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            $schema: 'https://local.schema.json',
         };

         const remote: Partial<AiJsonConfig> = {
            $schema: 'https://remote.schema.json',
         };

         const result = mergeConfigs(local, remote);

         expect(result.$schema).toBe('https://remote.schema.json');
      });

      it('remote wins for extends', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            extends: 'local-base',
         };

         const remote: Partial<AiJsonConfig> = {
            extends: 'remote-base',
         };

         const result = mergeConfigs(local, remote);

         expect(result.extends).toBe('remote-base');
      });
   });
});

describe('mergeConfigs with false values', () => {
   const emptyConfig: AiJsonConfig = {
      skills: {},
      mcp: {},
      rules: {},
      prompts: {},
   };

   describe('false removes entry from merged result', () => {
      it('removes MCP server when remote has false', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            mcp: {
               playwright: mcpServer('npx', ['-y', '@playwright/mcp']),
            },
         };

         const remote: Partial<AiJsonConfig> = {
            mcp: {
               playwright: false,
            },
         };

         const result = mergeConfigs(local, remote);

         expect(result.mcp?.playwright).toBeUndefined();
      });

      it('removes rule when remote has false', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            rules: {
               'my-rule': { content: 'rule content' },
            },
         };

         const remote: Partial<AiJsonConfig> = {
            rules: {
               'my-rule': false,
            },
         };

         const result = mergeConfigs(local, remote);

         expect(result.rules?.['my-rule']).toBeUndefined();
      });

      it('removes skill when remote has false', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            skills: {
               pdf: { git: 'https://github.com/test/skills', path: 'skills/pdf' },
            },
         };

         const remote: Partial<AiJsonConfig> = {
            skills: {
               pdf: false,
            },
         };

         const result = mergeConfigs(local, remote);

         expect(result.skills?.pdf).toBeUndefined();
      });

      it('removes prompt when remote has false', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            prompts: {
               'code-review': { content: 'Review this code' },
            },
         };

         const remote: Partial<AiJsonConfig> = {
            prompts: {
               'code-review': false,
            },
         };

         const result = mergeConfigs(local, remote);

         expect(result.prompts?.['code-review']).toBeUndefined();
      });
   });

   describe('object wins over false', () => {
      it('remote object wins over local false (re-enables)', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            mcp: {
               playwright: false as unknown as McpServerConfig,
            },
         };

         const remote: Partial<AiJsonConfig> = {
            mcp: {
               playwright: mcpServer('remote-cmd'),
            },
         };

         const result = mergeConfigs(local, remote);

         // Remote object should win over local false (re-enables the server)
         expect(result.mcp?.playwright).toBeDefined();
         const transport = getTransport(result.mcp!.playwright as McpServerConfig);

         expect(transport.type).toBe('stdio');
         if (transport.type === 'stdio') {
            expect(transport.command).toBe('remote-cmd');
         }
      });
   });

   describe('false in both results in removal', () => {
      it('removes entry when both local and remote have false', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            mcp: {
               playwright: false as unknown as McpServerConfig,
            },
         };

         const remote: Partial<AiJsonConfig> = {
            mcp: {
               playwright: false,
            },
         };

         const result = mergeConfigs(local, remote);

         expect(result.mcp?.playwright).toBeUndefined();
      });
   });

   describe('false values are filtered from final result', () => {
      it('filters false values from local when remote has mcp section', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            mcp: {
               playwright: false as unknown as McpServerConfig,
               github: mcpServer('npx', ['-y', '@modelcontextprotocol/server-github']),
            },
         };

         // Remote must have mcp section to trigger the merge logic
         const result = mergeConfigs(local, { mcp: {} });

         expect(result.mcp?.playwright).toBeUndefined();
         expect(result.mcp?.github).toBeDefined();
      });

      it('preserves false values in local when remote has no mcp section', () => {
         const local: AiJsonConfig = {
            ...emptyConfig,
            mcp: {
               playwright: false as unknown as McpServerConfig,
               github: mcpServer('npx', ['-y', '@modelcontextprotocol/server-github']),
            },
         };

         // When remote doesn't have mcp section, local is preserved as-is
         const result = mergeConfigs(local, {});

         // False values are preserved when no merge happens
         expect(result.mcp?.playwright).toBe(false);
         expect(result.mcp?.github).toBeDefined();
      });
   });
});

describe('filterConfigByScopes', () => {
   const fullConfig: AiJsonConfig = {
      skills: {
         pdf: { git: 'https://github.com/test/skills', path: 'skills/pdf' },
      },
      mcp: {
         playwright: mcpServer('npx'),
      },
      rules: { 'test-rule': { content: 'test rule' } },
      prompts: {},
      editors: {
         windsurf: { enabled: true },
      },
   };

   it('returns only mcp section when scope is mcp', () => {
      const result = filterConfigByScopes(fullConfig, ['mcp']);

      expect(result).toEqual({ mcp: fullConfig.mcp });
      expect(result.skills).toBeUndefined();
      expect(result.rules).toBeUndefined();
      expect(result.editors).toBeUndefined();
   });

   it('returns only rules section when scope is rules', () => {
      const result = filterConfigByScopes(fullConfig, ['rules']);

      expect(result).toEqual({ rules: fullConfig.rules });
      expect(result.mcp).toBeUndefined();
      expect(result.skills).toBeUndefined();
      expect(result.editors).toBeUndefined();
   });

   it('returns only skills section when scope is skills', () => {
      const result = filterConfigByScopes(fullConfig, ['skills']);

      expect(result).toEqual({ skills: fullConfig.skills });
      expect(result.mcp).toBeUndefined();
      expect(result.rules).toBeUndefined();
      expect(result.editors).toBeUndefined();
   });

   it('returns only editors section when scope is editors', () => {
      const result = filterConfigByScopes(fullConfig, ['editors']);

      expect(result).toEqual({ editors: fullConfig.editors });
      expect(result.mcp).toBeUndefined();
      expect(result.rules).toBeUndefined();
      expect(result.skills).toBeUndefined();
   });

   it('returns multiple sections when multiple scopes provided', () => {
      const result = filterConfigByScopes(fullConfig, ['mcp', 'rules']);

      expect(result).toEqual({
         mcp: fullConfig.mcp,
         rules: fullConfig.rules,
      });
      expect(result.skills).toBeUndefined();
      expect(result.editors).toBeUndefined();
   });

   it('returns all four sections when all scopes provided', () => {
      const allScopes: ConfigScope[] = ['rules', 'mcp', 'skills', 'editors'];
      const result = filterConfigByScopes(fullConfig, allScopes);

      expect(result).toEqual({
         skills: fullConfig.skills,
         mcp: fullConfig.mcp,
         rules: fullConfig.rules,
         editors: fullConfig.editors,
      });
   });

   it('returns empty object when no scopes provided', () => {
      const result = filterConfigByScopes(fullConfig, []);

      expect(result).toEqual({});
   });

   it('handles missing sections gracefully', () => {
      const sparseConfig: AiJsonConfig = {
         skills: {},
         mcp: {},
         rules: {},
         prompts: {},
      };

      const result = filterConfigByScopes(sparseConfig, ['editors']);

      expect(result).toEqual({});
   });
});
