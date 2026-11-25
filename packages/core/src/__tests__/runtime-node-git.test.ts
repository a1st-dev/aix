import { describe, expect, it, vi } from 'vitest';
import { nodeRuntimeAdapter } from '../runtime/index.js';

interface RecordedDownload {
   template: string;
   options: Record<string, unknown>;
   token: string | undefined;
}

const giget = vi.hoisted(() => {
   const downloads: RecordedDownload[] = [];

   return { downloads };
});

/** Stands in for giget, which reads the token from the environment as a download starts. */
vi.mock('giget', () => {
   return {
      downloadTemplate: (template: string, options: Record<string, unknown>) => {
         giget.downloads.push({ template, options, token: process.env.GIGET_AUTH });

         return Promise.resolve({ dir: String(options.dir) });
      },
   };
});

describe('node runtime adapter git downloads', () => {
   async function download(template: string): Promise<RecordedDownload | undefined> {
      vi.stubEnv('GIGET_AUTH', 'secret-token');
      giget.downloads.length = 0;

      await nodeRuntimeAdapter.git.downloadTemplate(template, { dir: '/unused' });

      return giget.downloads[0];
   }

   it.each([ 'github:org/repo#main', 'gitlab:org/repo', 'org/repo' ])('lets the git host token through for %s', async (template) => {
      const recorded = await download(template);

      expect(recorded?.token).toStrictEqual('secret-token');
   });

   it.each([ 'https://example.com/skill.tar.gz', 'http://example.com/skill.tar.gz' ])('hides the git host token from %s', async (template) => {
      const recorded = await download(template);

      expect(recorded?.token).toBeUndefined();
      expect(process.env.GIGET_AUTH).toStrictEqual('secret-token');
   });

   it('never uses the template registry', async () => {
      const recorded = await download('org/repo');

      expect(recorded?.options.registry).toStrictEqual(false);
   });
});
