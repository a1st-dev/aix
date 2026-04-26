import { describe, expect, it } from 'vitest';
import { detectEditors } from '../editors/install.js';
import { importFromEditor } from '../editors/import.js';
import { UnsupportedRuntimeCapabilityError } from '../errors.js';
import { loadFromGitShorthand } from '../remote-loader.js';
import {
   nodeRuntimeAdapter,
   withRuntimeAdapter,
   type RuntimeAdapter,
} from '../runtime/index.js';

describe('browser runtime capability guards', () => {
   it('rejects global editor detection without host home access', async () => {
      await expect(
         withRuntimeAdapter(createBrowserLikeAdapter(), async () => {
            return detectEditors('/virtual/project');
         }),
      ).rejects.toThrow(UnsupportedRuntimeCapabilityError);
   });

   it('rejects global editor import without host home access', async () => {
      await expect(
         withRuntimeAdapter(createBrowserLikeAdapter(), async () => {
            return importFromEditor('cursor');
         }),
      ).rejects.toThrow('Missing capability: global-home-access');
   });

   it('rejects git shorthand loading when git download is unavailable', async () => {
      await expect(
         withRuntimeAdapter(createBrowserLikeAdapter(), async () => {
            return loadFromGitShorthand('github:a1st-dev/aix');
         }),
      ).rejects.toThrow('Missing capability: git-download');
   });
});

function createBrowserLikeAdapter(): RuntimeAdapter {
   return {
      ...nodeRuntimeAdapter,
      git: {
         downloadTemplate: async () => {
            throw new UnsupportedRuntimeCapabilityError('git-download', 'downloading git content');
         },
      },
      host: {
         supportsGlobalHomeAccess: () => {
            return false;
         },
      },
      npm: {
         ensureDependencyInstalled: async () => {
            throw new UnsupportedRuntimeCapabilityError('npm-install', 'installing npm dependencies');
         },
         resolvePackagePath: async () => {
            throw new UnsupportedRuntimeCapabilityError('npm-resolution', 'resolving npm package paths');
         },
      },
   };
}
