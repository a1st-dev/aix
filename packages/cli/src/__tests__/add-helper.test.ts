import { existsSync } from 'node:fs';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeRm } from '@a1st/aix-core';
import { addMcp, addSkill, findProjectConfig, removeMcp, removeSkill } from '../lib/add-helper.js';

function createTestDir(): string {
   return join(tmpdir(), `aix-add-helper-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

async function writeConfig(testDir: string): Promise<string> {
   const configPath = join(testDir, 'ai.json');

   await mkdir(testDir, { recursive: true });
   await writeFile(
      configPath,
      JSON.stringify(
         {
            $schema: 'https://x.a1st.dev/schemas/v1/ai.json',
            skills: {},
            mcp: {},
            rules: {},
            prompts: {},
         },
         null,
         2,
      ),
   );

   return configPath;
}

describe('addSkill helper', () => {
   const testDirs: string[] = [];

   afterEach(async () => {
      await Promise.all(testDirs.splice(0).map((dir) => safeRm(dir, { force: true })));
   });

   // `aix search` installs a chosen result through this helper, so the git shape a search
   // result carries has to land in ai.json intact.
   it('adds a git skill source under its inferred name for the search install flow', async () => {
      const testDir = createTestDir();

      testDirs.push(testDir);

      const configPath = await writeConfig(testDir),
            // `name` is empty here so the helper falls back to inferring one from the
            // source, which is what a search result without an explicit name does.
            result = await addSkill({
               configPath,
               name: '',
               source: 'https://github.com/google-labs-code/stitch-skills/tree/main/skills/react-components',
               skipInstall: true,
            });

      expect(result.success).toStrictEqual(true);
      expect(result.name).toStrictEqual('react-components');

      const config = JSON.parse(await readFile(configPath, 'utf-8'));

      expect(config.skills['react-components']).toEqual({
         git: 'https://github.com/google-labs-code/stitch-skills',
         ref: 'main',
         path: 'skills/react-components',
      });
   });

   // Catalog entries can carry names that are not valid skill keys; the key written to
   // ai.json has to be the normalized one, or `removeSkill` cannot find it again.
   it('normalizes a catalog-style name before writing the skill key', async () => {
      const testDir = createTestDir();

      testDirs.push(testDir);

      const configPath = await writeConfig(testDir),
            result = await addSkill({
               configPath,
               name: 'React Components',
               source: 'https://github.com/google-labs-code/stitch-skills/tree/main/skills/react-components',
               skipInstall: true,
            });

      expect(result.success).toStrictEqual(true);

      const config = JSON.parse(await readFile(configPath, 'utf-8'));

      expect(Object.keys(config.skills)).toEqual(['react-components']);
   });

   it('reports failure when no name can be inferred from the source', async () => {
      const testDir = createTestDir();

      testDirs.push(testDir);

      const configPath = await writeConfig(testDir),
            result = await addSkill({ configPath, name: '', source: '', skipInstall: true });

      expect(result.success).toStrictEqual(false);
   });
});

describe('removeSkill helper', () => {
   const testDirs: string[] = [];

   afterEach(async () => {
      await Promise.all(testDirs.splice(0).map((dir) => safeRm(dir, { force: true })));
   });

   it('cleans native skill files for search uninstall flow', async () => {
      const testDir = createTestDir(),
            configPath = join(testDir, 'ai.json'),
            sourceSkillDir = join(testDir, '.aix', 'skills', 'demo-skill'),
            editorSkillDir = join(testDir, '.github', 'skills');

      testDirs.push(testDir);

      await mkdir(sourceSkillDir, { recursive: true });
      await mkdir(editorSkillDir, { recursive: true });
      await writeFile(
         configPath,
         JSON.stringify(
            {
               $schema: 'https://x.a1st.dev/schemas/v1/ai.json',
               scope: 'project',
               skills: { 'demo-skill': './skills/demo-skill' },
               mcp: {},
               rules: {},
               prompts: {},
               editors: ['copilot'],
            },
            null,
            2,
         ),
      );
      await writeFile(
         join(sourceSkillDir, 'SKILL.md'),
         `---
name: demo-skill
description: Demo skill
---
`,
      );
      await symlink(join('..', '..', '.aix', 'skills', 'demo-skill'), join(editorSkillDir, 'demo-skill'));

      await expect(removeSkill({ configPath, name: 'demo-skill' })).resolves.toEqual({
         success: true,
         name: 'demo-skill',
      });

      expect(existsSync(join(testDir, '.aix', 'skills', 'demo-skill'))).toBe(false);
      expect(existsSync(join(testDir, '.github', 'skills', 'demo-skill'))).toBe(false);
   });

   it('removes normalized skill keys for catalog-style search results', async () => {
      const testDir = createTestDir(),
            configPath = join(testDir, 'ai.json'),
            sourceSkillDir = join(testDir, '.aix', 'skills', 'react-components'),
            editorSkillDir = join(testDir, '.github', 'skills');

      testDirs.push(testDir);

      await mkdir(sourceSkillDir, { recursive: true });
      await mkdir(editorSkillDir, { recursive: true });
      await writeFile(
         configPath,
         JSON.stringify(
            {
               $schema: 'https://x.a1st.dev/schemas/v1/ai.json',
               scope: 'project',
               skills: {
                  'react-components': {
                     git: 'https://github.com/google-labs-code/stitch-skills',
                     path: 'skills/react-components',
                  },
               },
               mcp: {},
               rules: {},
               prompts: {},
               editors: ['copilot'],
            },
            null,
            2,
         ),
      );
      await writeFile(
         join(sourceSkillDir, 'SKILL.md'),
         `---
name: react-components
description: Demo skill
---
`,
      );
      await symlink(join('..', '..', '.aix', 'skills', 'react-components'), join(editorSkillDir, 'react-components'));

      await expect(removeSkill({ configPath, name: 'react:components' })).resolves.toEqual({
         success: true,
         name: 'react-components',
      });

      expect(existsSync(join(testDir, '.aix', 'skills', 'react-components'))).toBe(false);
      expect(existsSync(join(testDir, '.github', 'skills', 'react-components'))).toBe(false);
      await expect(readFile(configPath, 'utf-8')).resolves.not.toContain('react-components');
   });
});

function registryServer(name: string, identifier: string): object {
   return {
      server: {
         name,
         description: name,
         version: '1.0.0',
         packages: [ { registryType: 'npm', identifier, version: '1.0.0', transport: { type: 'stdio' } } ],
      },
   };
}

describe('addMcp helper', () => {
   const testDirs: string[] = [];

   afterEach(async () => {
      await Promise.all(testDirs.splice(0).map((dir) => safeRm(dir, { force: true })));
   });

   it('adds the server the caller selected, not the first search result', async () => {
      const testDir = createTestDir(),
            configPath = join(testDir, 'ai.json'),
            servers = [
               registryServer('io.github.someone/filesystem', 'someone-filesystem'),
               registryServer('io.github.official/filesystem', 'official-filesystem'),
            ];

      testDirs.push(testDir);
      await mkdir(testDir, { recursive: true });
      await writeFile(configPath, JSON.stringify({ mcp: {} }));
      vi.stubGlobal('fetch', async () => {
         return new Response(JSON.stringify({ servers, metadata: { count: servers.length } }), {
            headers: { 'content-type': 'application/json' },
         });
      });

      const result = await addMcp({
               configPath,
               name: 'filesystem',
               serverName: 'io.github.official/filesystem',
               skipInstall: true,
            }),
            config = JSON.parse(await readFile(configPath, 'utf-8'));

      vi.unstubAllGlobals();

      expect(result).toEqual({ success: true, name: 'filesystem' });
      expect(config.mcp.filesystem.command).toContain('official-filesystem');
   });
});

describe('removeMcp helper', () => {
   const testDirs: string[] = [];

   afterEach(async () => {
      await Promise.all(testDirs.splice(0).map((dir) => safeRm(dir, { force: true })));
   });

   it('removes the server from the editor as well as from ai.json', async () => {
      const testDir = createTestDir(),
            configPath = join(testDir, 'ai.json'),
            editorConfigPath = join(testDir, '.mcp.json'),
            server = { command: 'node', args: [ 'docs.js' ] };

      testDirs.push(testDir);
      await mkdir(testDir, { recursive: true });
      await writeFile(configPath, JSON.stringify({ scope: 'project', editors: [ 'claude-code' ], mcp: { docs: server } }));
      await writeFile(editorConfigPath, JSON.stringify({ mcpServers: { docs: server, mine: server } }));

      const result = await removeMcp({ configPath, name: 'docs' }),
            config = JSON.parse(await readFile(configPath, 'utf-8')),
            editorConfig = JSON.parse(await readFile(editorConfigPath, 'utf-8'));

      expect(result).toEqual({ success: true, name: 'docs' });
      expect(config.mcp.docs).toBeUndefined();
      expect(Object.keys(editorConfig.mcpServers)).toEqual([ 'mine' ]);
   });
});

describe('findProjectConfig', () => {
   const testDirs: string[] = [];

   afterEach(async () => {
      await Promise.all(testDirs.splice(0).map((dir) => safeRm(dir, { force: true })));
   });

   it('reports the skills and MCP servers ai.json declares, leaving out disabled ones', async () => {
      const testDir = createTestDir(),
            configPath = join(testDir, 'ai.json');

      testDirs.push(testDir);
      await mkdir(join(testDir, 'nested'), { recursive: true });
      await writeFile(configPath, JSON.stringify({
         skills: { review: './skills/review', disabled: false },
         mcp: { docs: { command: 'node' }, off: false },
      }));

      const found = await findProjectConfig(join(testDir, 'nested'));

      expect(found?.path).toStrictEqual(configPath);
      expect([ ...found?.declaredNames ?? [] ].toSorted()).toEqual([ 'docs', 'review' ]);
   });

   it('finds nothing where there is no ai.json', async () => {
      const testDir = createTestDir();

      testDirs.push(testDir);
      await mkdir(testDir, { recursive: true });

      expect(await findProjectConfig(testDir)).toBeNull();
   });
});
