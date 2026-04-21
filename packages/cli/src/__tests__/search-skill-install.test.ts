import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSkillInstallRequest } from '../lib/search/skill-install.js';

describe('getSkillInstallRequest', () => {
   afterEach(() => {
      vi.restoreAllMocks();
   });

   it('resolves skills-library results to a concrete repo path and normalizes the config name', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
         ok: true,
         json: async () => [
            { name: 'react-best-practices', type: 'dir' },
            { name: 'react-components', type: 'dir' },
         ],
      } as Response);

      await expect(
         getSkillInstallRequest({
            name: 'react:components',
            description: 'Agent skill from google-labs-code/stitch-skills',
            source: 'skills-library',
            meta: {
               id: 'google-labs-code/stitch-skills/react:components',
               skillId: 'react:components',
               source: 'google-labs-code/stitch-skills',
            },
         }),
      ).resolves.toEqual({
         name: 'react-components',
         source: 'google-labs-code/stitch-skills/skills/react-components',
      });
   });

   it('falls back to a best-effort skills path when repository lookup fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
         ok: false,
      } as Response);

      await expect(
         getSkillInstallRequest({
            name: 'vercel-react-best-practices',
            description: 'Agent skill from vercel-labs/agent-skills',
            source: 'skills-library',
            meta: {
               id: 'vercel-labs/agent-skills/vercel-react-best-practices',
               skillId: 'vercel-react-best-practices',
               source: 'vercel-labs/agent-skills',
            },
         }),
      ).resolves.toEqual({
         name: 'vercel-react-best-practices',
         source: 'vercel-labs/agent-skills/skills/vercel-react-best-practices',
      });
   });
});
