import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { resolveGit } from '../../skills/resolvers/git.js';
import { safeRm } from '../../fs/safe-rm.js';
import {
   nodeRuntimeAdapter,
   resetRuntimeAdapter,
   withRuntimeAdapter,
   type RuntimeAdapter,
} from '../../runtime/index.js';

const ROOT_REPO: Record<string, string> = {
   'SKILL.md': '---\nname: root-skill\n---\nRoot skill.\n',
};

const NESTED_REPO: Record<string, string> = {
   'skills/nested/SKILL.md': '---\nname: nested-skill\n---\nNested skill.\n',
   'skills/deep/child/SKILL.md': '---\nname: deep-skill\n---\nDeep skill.\n',
};

function createRuntimeAdapter(
   downloadTemplate: RuntimeAdapter['git']['downloadTemplate'],
   testTmpDir: string,
): RuntimeAdapter {
   return {
      ...nodeRuntimeAdapter,
      os: {
         ...nodeRuntimeAdapter.os,
         tmpdir: () => testTmpDir,
      },
      git: { downloadTemplate },
   };
}

describe('resolveGit', () => {
   let testTmpDir: string;

   beforeEach(() => {
      testTmpDir = join(
         tmpdir(),
         `aix-test-git-resolver-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
   });

   afterEach(async () => {
      resetRuntimeAdapter();
      await safeRm(testTmpDir, { force: true });
   });

   it('resolves a skill at the repo root', async () => {
      const adapter = createRuntimeAdapter(async (_source, options) => {
         const target = options.dir ?? testTmpDir;

         await writeRepo(target, ROOT_REPO);

         return { dir: target };
      }, testTmpDir);

      await withRuntimeAdapter(adapter, async () => {
         const result = await resolveGit({
            type: 'git',
            url: 'https://github.com/acme/root-skill',
         });

         expect(result.frontmatter.name).toBe('root-skill');
         expect(result.source).toBe('git');
      });
   });

   it('finds a SKILL.md nested under skills/<name>', async () => {
      const adapter = createRuntimeAdapter(async (_source, options) => {
         const target = options.dir ?? testTmpDir;

         await writeRepo(target, NESTED_REPO);

         return { dir: target };
      }, testTmpDir);

      await withRuntimeAdapter(adapter, async () => {
         const result = await resolveGit({
            type: 'git',
            url: 'https://github.com/AminBlg/SimpleEnglish',
         });

         expect(result.frontmatter.name).toBe('nested-skill');
         expect(result.basePath).toMatch(/skills[/\\]nested$/);
      });
   });

   it('prefers the shallowest SKILL.md when multiple exist', async () => {
      const adapter = createRuntimeAdapter(async (_source, options) => {
         const target = options.dir ?? testTmpDir;

         await writeRepo(target, NESTED_REPO);

         return { dir: target };
      }, testTmpDir);

      await withRuntimeAdapter(adapter, async () => {
         const result = await resolveGit({
            type: 'git',
            url: 'https://github.com/acme/multi-skill',
         });

         expect(result.frontmatter.name).toBe('nested-skill');
      });
   });

   it('throws when no SKILL.md exists in the repo', async () => {
      const adapter = createRuntimeAdapter(async (_source, options) => {
         const target = options.dir ?? testTmpDir;

         await mkdir(target, { recursive: true });
         await writeFile(join(target, 'README.md'), '# No skills here');

         return { dir: target };
      }, testTmpDir);

      await withRuntimeAdapter(adapter, async () => {
         await expect(
            resolveGit({ type: 'git', url: 'https://github.com/acme/no-skill' }),
         ).rejects.toThrow(/SKILL.md not found/);
      });
   });
});

async function writeRepo(root: string, files: Record<string, string>): Promise<void> {
   await Promise.all(
      Object.entries(files).map(async ([relPath, content]) => {
         const filePath = join(root, relPath);

         await mkdir(join(filePath, '..'), { recursive: true });
         await writeFile(filePath, content);
      }),
   );
}
