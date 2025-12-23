import { BaseCommand } from '../../base-command.js';
import { clearCache, getCacheStatus } from '@a1st/aix-core';

/**
 * Format bytes into human-readable string.
 */
function formatBytes(bytes: number): string {
   if (bytes === 0) {
      return '0 B';
   }
   const k = 1024,
         sizes = ['B', 'KB', 'MB', 'GB'],
         i = Math.floor(Math.log(bytes) / Math.log(k));

   return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default class CacheClear extends BaseCommand<typeof CacheClear> {
   static override description = 'Clear cache files created by aix';

   static override aliases = ['cache:clean'];

   static override examples = ['<%= config.bin %> cache clear', '<%= config.bin %> cache clean'];

   async run(): Promise<void> {
      const projectRoot = process.cwd(),
            status = await getCacheStatus(projectRoot);

      if (status.totalSize === 0) {
         this.output.log('Cache is empty.');
         return;
      }

      const result = await clearCache(projectRoot);

      if (this.flags.json) {
         this.output.json({
            freedBytes: result.freedBytes,
            deletedPaths: result.deletedPaths,
         });
         return;
      }

      this.output.success(`Cleared ${formatBytes(result.freedBytes)}`);
   }
}
