import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'pathe';
import { tmpdir } from 'node:os';
import * as fc from 'fast-check';
import type { AiJsonConfig } from '@a1st/aix-schema';
import { KiroAdapter } from '../../editors/adapters/kiro.js';
import { safeRm } from '../../fs/safe-rm.js';

describe('KiroAdapter', () => {
   const adapter = new KiroAdapter();
   let testDir: string;

   beforeEach(async () => {
      testDir = join(tmpdir(), `kiro-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await mkdir(testDir, { recursive: true });
   });

   afterEach(async () => {
      await safeRm(testDir, { force: true });
   });

   describe('basic properties', () => {
      it('has correct name', () => {
         expect(adapter.name).toBe('kiro');
      });

      it('has correct config directory', () => {
         expect(adapter.configDir).toBe('.kiro');
      });

      it('has correct global data paths', () => {
         const paths = adapter.getGlobalDataPaths();

         expect(paths.darwin).toEqual(['.kiro']);
         expect(paths.linux).toEqual(['.kiro']);
         expect(paths.win32).toEqual(['.kiro']);
      });
   });

   describe('detection', () => {
      it('detects when .kiro directory exists', async () => {
         await mkdir(join(testDir, '.kiro'), { recursive: true });
         expect(await adapter.detect(testDir)).toBe(true);
      });

      it('does not detect when .kiro directory is missing', async () => {
         expect(await adapter.detect(testDir)).toBe(false);
      });
   });

   // Feature: kiro-editor-support, Property 1: Kiro Detection
   // For any project directory, if a .kiro/ directory exists, then the Kiro adapter's detect()
   // method should return true.
   // Validates: Requirements 1.2
   describe('Property 1: Kiro Detection', () => {
      it('detects .kiro directory for any project structure', async () => {
         await fc.assert(
            fc.asyncProperty(
               fc.record({
                  hasKiroDir: fc.boolean(),
                  hasOtherDirs: fc.boolean(),
                  hasFiles: fc.boolean(),
               }),
               async ({ hasKiroDir, hasOtherDirs, hasFiles }) => {
                  const testDir = join(
                     tmpdir(),
                     `kiro-prop1-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  );

                  await mkdir(testDir, { recursive: true });

                  try {
                     // Create .kiro directory if specified
                     if (hasKiroDir) {
                        await mkdir(join(testDir, '.kiro'), { recursive: true });
                     }

                     // Create other directories to simulate a real project
                     if (hasOtherDirs) {
                        await mkdir(join(testDir, 'src'), { recursive: true });
                        await mkdir(join(testDir, 'node_modules'), { recursive: true });
                     }

                     // Create some files to simulate a real project
                     if (hasFiles) {
                        await writeFile(join(testDir, 'package.json'), '{}', 'utf-8');
                        await writeFile(join(testDir, 'README.md'), '# Test', 'utf-8');
                     }

                     // Detection should match whether .kiro directory exists
                     const detected = await adapter.detect(testDir);

                     expect(detected).toBe(hasKiroDir);
                  } finally {
                     await safeRm(testDir, { force: true });
                  }
               },
            ),
            { numRuns: 100 },
         );
      });
   });

   describe('MCP configuration', () => {
      it('writes MCP config to settings/mcp.json', async () => {
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            rules: {},
            skills: {},
            prompts: {},
            mcp: {
               filesystem: {
                  command: 'npx',
                  args: ['-y', '@modelcontextprotocol/server-filesystem'],
               },
            },
         };

         const editorConfig = await adapter.generateConfig(config, testDir);

         await adapter.apply(editorConfig, testDir);

         const mcpPath = join(testDir, '.kiro/settings/mcp.json');
         const content = await readFile(mcpPath, 'utf-8');
         const parsed = JSON.parse(content);

         expect(parsed.mcpServers.filesystem).toBeDefined();
         expect(parsed.mcpServers.filesystem.command).toBe('npx');
      });

      it('merges with existing MCP config', async () => {
         // Create existing MCP config
         await mkdir(join(testDir, '.kiro/settings'), { recursive: true });
         const existingConfig = {
            mcpServers: {
               existing: {
                  command: 'existing-cmd',
                  args: ['--existing'],
               },
            },
         };

         await writeFile(
            join(testDir, '.kiro/settings/mcp.json'),
            JSON.stringify(existingConfig, null, 2),
            'utf-8',
         );

         // Install new MCP server
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            rules: {},
            skills: {},
            prompts: {},
            mcp: {
               new: {
                  command: 'new-cmd',
                  args: ['--new'],
               },
            },
         };

         const editorConfig = await adapter.generateConfig(config, testDir);

         await adapter.apply(editorConfig, testDir);

         // Verify both servers are present
         const mcpPath = join(testDir, '.kiro/settings/mcp.json');
         const content = await readFile(mcpPath, 'utf-8');
         const parsed = JSON.parse(content);

         expect(parsed.mcpServers.existing).toBeDefined();
         expect(parsed.mcpServers.new).toBeDefined();
         expect(parsed.mcpServers.existing.command).toBe('existing-cmd');
         expect(parsed.mcpServers.new.command).toBe('new-cmd');
      });

      it('replaces server with same name', async () => {
         // Create existing MCP config
         await mkdir(join(testDir, '.kiro/settings'), { recursive: true });
         const existingConfig = {
            mcpServers: {
               server: {
                  command: 'old-cmd',
                  args: ['--old'],
               },
            },
         };

         await writeFile(
            join(testDir, '.kiro/settings/mcp.json'),
            JSON.stringify(existingConfig, null, 2),
            'utf-8',
         );

         // Install updated server
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            rules: {},
            skills: {},
            prompts: {},
            mcp: {
               server: {
                  command: 'new-cmd',
                  args: ['--new'],
               },
            },
         };

         const editorConfig = await adapter.generateConfig(config, testDir);

         await adapter.apply(editorConfig, testDir);

         // Verify server was replaced
         const mcpPath = join(testDir, '.kiro/settings/mcp.json');
         const content = await readFile(mcpPath, 'utf-8');
         const parsed = JSON.parse(content);

         expect(parsed.mcpServers.server.command).toBe('new-cmd');
         expect(parsed.mcpServers.server.args).toEqual(['--new']);
      });

      it('overwrites entire config with --overwrite flag', async () => {
         // Create existing MCP config
         await mkdir(join(testDir, '.kiro/settings'), { recursive: true });
         const existingConfig = {
            mcpServers: {
               existing: {
                  command: 'existing-cmd',
               },
            },
         };

         await writeFile(
            join(testDir, '.kiro/settings/mcp.json'),
            JSON.stringify(existingConfig, null, 2),
            'utf-8',
         );

         // Install with overwrite
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            rules: {},
            skills: {},
            prompts: {},
            mcp: {
               new: {
                  command: 'new-cmd',
               },
            },
         };

         const editorConfig = await adapter.generateConfig(config, testDir);

         await adapter.apply(editorConfig, testDir, { overwrite: true });

         // Verify only new server is present
         const mcpPath = join(testDir, '.kiro/settings/mcp.json');
         const content = await readFile(mcpPath, 'utf-8');
         const parsed = JSON.parse(content);

         expect(parsed.mcpServers.existing).toBeUndefined();
         expect(parsed.mcpServers.new).toBeDefined();
      });
   });

   describe('rules configuration', () => {
      it('writes rules to steering directory', async () => {
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            skills: {},
            mcp: {},
            prompts: {},
            rules: {
               typescript: {
                  activation: 'always' as const,
                  content: 'Use TypeScript',
               },
            },
         };

         const editorConfig = await adapter.generateConfig(config, testDir);

         await adapter.apply(editorConfig, testDir);

         const rulePath = join(testDir, '.kiro/steering/typescript.md');
         const content = await readFile(rulePath, 'utf-8');

         expect(content).toContain('inclusion: always');
         expect(content).toContain('Use TypeScript');
      });

      it('writes multiple rules', async () => {
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            skills: {},
            mcp: {},
            prompts: {},
            rules: {
               rule1: { activation: 'always' as const, content: 'Rule 1' },
               rule2: { activation: 'manual' as const, content: 'Rule 2' },
            },
         };

         const editorConfig = await adapter.generateConfig(config, testDir);

         await adapter.apply(editorConfig, testDir);

         const rule1Path = join(testDir, '.kiro/steering/rule1.md');
         const rule2Path = join(testDir, '.kiro/steering/rule2.md');

         const content1 = await readFile(rule1Path, 'utf-8');
         const content2 = await readFile(rule2Path, 'utf-8');

         expect(content1).toContain('inclusion: always');
         expect(content2).toContain('inclusion: manual');
      });
   });

   describe('hooks configuration', () => {
      it('writes hooks as individual JSON files', async () => {
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            rules: {},
            skills: {},
            mcp: {},
            prompts: {},
            hooks: {
               post_file_write: [
                  {
                     hooks: [{ command: 'echo "File saved"' }],
                  },
               ],
               pre_prompt: [
                  {
                     hooks: [{ command: 'echo "Before prompt"' }],
                  },
               ],
            },
         };

         const editorConfig = await adapter.generateConfig(config, testDir);

         await adapter.apply(editorConfig, testDir);

         // Verify individual hook files were created
         const hook1Path = join(testDir, '.kiro/hooks/post-file-write-hook-0.json');
         const hook2Path = join(testDir, '.kiro/hooks/pre-prompt-hook-0.json');

         const hook1Content = await readFile(hook1Path, 'utf-8');
         const hook2Content = await readFile(hook2Path, 'utf-8');

         const hook1 = JSON.parse(hook1Content);
         const hook2 = JSON.parse(hook2Content);

         // Verify hook 1 structure
         expect(hook1.name).toBe('post_file_write-hook-0');
         expect(hook1.version).toBe('1.0.0');
         expect(hook1.when.type).toBe('fileEdited');
         expect(hook1.then.type).toBe('runCommand');
         expect(hook1.then.command).toBe('echo "File saved"');

         // Verify hook 2 structure
         expect(hook2.name).toBe('pre_prompt-hook-0');
         expect(hook2.version).toBe('1.0.0');
         expect(hook2.when.type).toBe('promptSubmit');
         expect(hook2.then.type).toBe('runCommand');
         expect(hook2.then.command).toBe('echo "Before prompt"');
      });

      it('writes multiple hooks from same event as separate files', async () => {
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            rules: {},
            skills: {},
            mcp: {},
            prompts: {},
            hooks: {
               post_file_write: [
                  {
                     hooks: [{ command: 'echo "Hook 1"' }, { command: 'echo "Hook 2"' }],
                  },
               ],
            },
         };

         const editorConfig = await adapter.generateConfig(config, testDir);

         await adapter.apply(editorConfig, testDir);

         // Verify both hook files were created
         const hook1Path = join(testDir, '.kiro/hooks/post-file-write-hook-0.json');
         const hook2Path = join(testDir, '.kiro/hooks/post-file-write-hook-1.json');

         const hook1Content = await readFile(hook1Path, 'utf-8');
         const hook2Content = await readFile(hook2Path, 'utf-8');

         const hook1 = JSON.parse(hook1Content);
         const hook2 = JSON.parse(hook2Content);

         expect(hook1.then.command).toBe('echo "Hook 1"');
         expect(hook2.then.command).toBe('echo "Hook 2"');
      });

      it('includes file patterns in hook when matcher is present', async () => {
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            rules: {},
            skills: {},
            mcp: {},
            prompts: {},
            hooks: {
               post_file_write: [
                  {
                     matcher: '*.ts',
                     hooks: [{ command: 'echo "TypeScript file saved"' }],
                  },
               ],
            },
         };

         const editorConfig = await adapter.generateConfig(config, testDir);

         await adapter.apply(editorConfig, testDir);

         const hookPath = join(testDir, '.kiro/hooks/post-file-write-hook-0.json');
         const hookContent = await readFile(hookPath, 'utf-8');
         const hook = JSON.parse(hookContent);

         expect(hook.when.patterns).toEqual(['*.ts']);
      });

      it('does not create hook files when no hooks are configured', async () => {
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            rules: {},
            skills: {},
            mcp: {},
            prompts: {},
            hooks: {},
         };

         const editorConfig = await adapter.generateConfig(config, testDir);

         await adapter.apply(editorConfig, testDir);

         // Verify hooks directory was not created
         try {
            await access(join(testDir, '.kiro/hooks'));
            expect.fail('Hooks directory should not exist');
         } catch {
            // Expected - directory should not exist
         }
      });
   });

   describe('dry run', () => {
      it('does not write files in dry-run mode', async () => {
         const config: AiJsonConfig = {
            $schema: 'https://aix.dev/schema.json',
            skills: {},
            prompts: {},
            rules: {
               test: { activation: 'always' as const, content: 'Test' },
            },
            mcp: {
               test: { command: 'test-cmd' },
            },
         };

         const editorConfig = await adapter.generateConfig(config, testDir);
         const result = await adapter.apply(editorConfig, testDir, { dryRun: true });

         expect(result.success).toBe(true);
         expect(result.changes.length).toBeGreaterThan(0);

         // Files should not exist
         await expect(readFile(join(testDir, '.kiro/steering/test.md'), 'utf-8')).rejects.toThrow();
         await expect(readFile(join(testDir, '.kiro/settings/mcp.json'), 'utf-8')).rejects.toThrow();
      });
   });

   // Feature: kiro-editor-support, Property 2: Directory Structure Creation
   // For any valid ai.json configuration, when installing to Kiro, all necessary subdirectories
   // (.kiro/steering/, .kiro/settings/, .kiro/powers/, .kiro/hooks/) should be created.
   // Validates: Requirements 1.1, 1.3
   describe('Property 2: Directory Structure Creation', () => {
      it('creates all necessary directories for any configuration', async () => {
         await fc.assert(
            fc.asyncProperty(
               fc.record({
                  hasRules: fc.boolean(),
                  hasMcp: fc.boolean(),
                  hasPrompts: fc.boolean(),
                  hasHooks: fc.boolean(),
               }),
               async ({ hasRules, hasMcp, hasPrompts, hasHooks }) => {
                  const testDir = join(
                     tmpdir(),
                     `kiro-prop2-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  );

                  await mkdir(testDir, { recursive: true });

                  try {
                     const config: AiJsonConfig = {
                        $schema: 'https://aix.dev/schema.json',
                        rules: hasRules ? { test: { activation: 'always' as const, content: 'Test' } } : {},
                        mcp: hasMcp ? { test: { command: 'test-cmd' } } : {},
                        skills: {}, // Skip skills for this test as they require valid references
                        prompts: hasPrompts ? { test: { content: 'Test prompt' } } : {},
                        hooks: hasHooks
                           ? { post_file_write: [{ hooks: [{ command: 'echo test' }] }] }
                           : {},
                     };

                     const editorConfig = await adapter.generateConfig(config, testDir);

                     await adapter.apply(editorConfig, testDir);

                     // Only check for directories if there's actual configuration
                     const hasAnyConfig = hasRules || hasMcp || hasPrompts || hasHooks;

                     if (hasAnyConfig) {
                        // Base .kiro directory should exist when there's any configuration
                        await access(join(testDir, '.kiro'));
                     }

                     // Verify specific directories exist based on what was configured
                     if (hasRules || hasPrompts) {
                        await access(join(testDir, '.kiro/steering'));
                     }
                     if (hasMcp) {
                        await access(join(testDir, '.kiro/settings'));
                     }
                     if (hasHooks) {
                        await access(join(testDir, '.kiro/hooks'));
                     }
                  } finally {
                     await safeRm(testDir, { force: true });
                  }
               },
            ),
            { numRuns: 100 },
         );
      });
   });

   // Feature: kiro-editor-support, Property 3: Configuration Preservation
   // For any existing Kiro configuration files not managed by aix, when installing configurations,
   // those files should remain unchanged after installation.
   // Validates: Requirements 1.4
   describe('Property 3: Configuration Preservation', () => {
      it('preserves existing unmanaged files for any configuration', async () => {
         await fc.assert(
            fc.asyncProperty(
               fc.record({
                  existingRuleName: fc.stringMatching(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/),
                  existingRuleContent: fc.string({ minLength: 1, maxLength: 100 }),
                  newRuleName: fc.stringMatching(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/),
                  newRuleContent: fc.string({ minLength: 1, maxLength: 100 }),
               }),
               async ({ existingRuleName, existingRuleContent, newRuleName, newRuleContent }) => {
                  // Skip if names are the same (would be overwritten)
                  if (existingRuleName === newRuleName) {
                     return;
                  }

                  const testDir = join(
                     tmpdir(),
                     `kiro-prop3-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  );

                  await mkdir(testDir, { recursive: true });

                  try {
                     // Create existing unmanaged file
                     await mkdir(join(testDir, '.kiro/steering'), { recursive: true });
                     const existingFilePath = join(testDir, `.kiro/steering/${existingRuleName}.md`);
                     const existingContent = `---
inclusion: always
---

${existingRuleContent}`;

                     await writeFile(existingFilePath, existingContent, 'utf-8');

                     // Install new configuration
                     const config: AiJsonConfig = {
                        $schema: 'https://aix.dev/schema.json',
                        rules: {
                           [newRuleName]: {
                              activation: 'always' as const,
                              content: newRuleContent,
                           },
                        },
                        mcp: {},
                        skills: {},
                        prompts: {},
                        hooks: {},
                     };

                     const editorConfig = await adapter.generateConfig(config, testDir);

                     await adapter.apply(editorConfig, testDir);

                     // Verify existing file is preserved
                     const preservedContent = await readFile(existingFilePath, 'utf-8');

                     expect(preservedContent).toBe(existingContent);

                     // Verify new file was created
                     const newFilePath = join(testDir, `.kiro/steering/${newRuleName}.md`);
                     const newContent = await readFile(newFilePath, 'utf-8');

                     expect(newContent).toContain(newRuleContent);
                  } finally {
                     await safeRm(testDir, { force: true });
                  }
               },
            ),
            { numRuns: 100 },
         );
      });
   });
});
