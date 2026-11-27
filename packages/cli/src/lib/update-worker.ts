import { checkForCLIUpdate, getUpdateInstallation } from './update-installation.js';
import { writeUpdateCache } from './update-notice.js';
import { getCheckForUpdates } from './update-settings.js';

async function run(root: string, current: string, cachePath: string): Promise<void> {
   if (!await getCheckForUpdates()) {
      return;
   }

   const installation = await getUpdateInstallation(root),
         update = installation ? await checkForCLIUpdate(installation, current) : undefined;

   await writeUpdateCache(cachePath, {
      current,
      checkedAt: Date.now(),
      available: update?.pinned ? undefined : update?.version,
   });
}

const [root, current, cachePath] = process.argv.slice(2);

if (root && current && cachePath) {
   try {
      await run(root, current, cachePath);
   } catch {
      // A network or package-manager failure leaves the attempted-check timestamp in place.
   }
}
