import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCI, isRecord, replaceFile } from '@a1st/aix-core';
import type { Config } from '@oclif/core';
import chalk from 'chalk';
import { getCheckForUpdates } from './update-settings.js';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UpdateCache {
   current: string;
   checkedAt: number;
   available?: string;
}

async function readUpdateCache(path: string): Promise<UpdateCache | undefined> {
   try {
      const data: unknown = JSON.parse(await readFile(path, 'utf8'));

      if (isRecord(data) && typeof data.current === 'string' && typeof data.checkedAt === 'number') {
         return {
            current: data.current,
            checkedAt: data.checkedAt,
            available: typeof data.available === 'string' ? data.available : undefined,
         };
      }
   } catch {
      // The cache is optional, including on the first run.
   }

   return undefined;
}

function canShowUpdateNotice(): boolean {
   const args = process.argv.slice(2);

   return Boolean(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY)
      && process.env.NODE_ENV !== 'development'
      && (args.length === 0 || (args.length === 1 && ['help', '--help', '-h'].includes(args[0] ?? '')));
}

function startBackgroundCheck(root: string, current: string, path: string): void {
   const worker = fileURLToPath(new URL('./update-worker.js', import.meta.url)),
         child = spawn(process.execPath, [worker, root, current, path], { stdio: 'ignore', windowsHide: true });

   child.on('error', () => {
      // A background check must never affect command output or exit status.
   });
   child.unref();
}

export async function writeUpdateCache(path: string, cache: UpdateCache): Promise<void> {
   await replaceFile(path, JSON.stringify(cache));
}

export async function showUpdateNotice(config: Pick<Config, 'root' | 'version' | 'cacheDir'>): Promise<void> {
   try {
      if (!canShowUpdateNotice() || await isCI() || !await getCheckForUpdates()) {
         return;
      }

      const { root, version, cacheDir } = config,
            key = createHash('sha256').update(root).digest('hex'),
            path = join(cacheDir, 'updates', `${key}.json`),
            noticePath = join(cacheDir, 'updates', `${key}.shown`),
            cached = await readUpdateCache(path),
            cache = cached?.current === version ? cached : undefined,
            now = Date.now();

      if (!cache || now - cache.checkedAt >= CHECK_INTERVAL_MS) {
         await writeUpdateCache(path, { current: version, checkedAt: now });
         startBackgroundCheck(root, version, path);
         return;
      }

      if (cache.available && await readFile(noticePath, 'utf8').catch(() => '') !== cache.available) {
         await replaceFile(noticePath, cache.available);
         console.error(`${chalk.bold.yellow('Update available')} · Run ${chalk.cyan('aix update')}\n`);
      }
   } catch {
      // Help works offline and with an unwritable cache.
   }
}
