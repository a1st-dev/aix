#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsx = fileURLToPath(import.meta.resolve('tsx/cli'));
const entry = join(packageRoot, 'src', 'cli.ts');
const result = spawnSync(process.execPath, [tsx, '--tsconfig', join(packageRoot, 'tsconfig.dev.json'), entry, ...process.argv.slice(2)], {
   stdio: 'inherit',
});

if (result.error) {
   console.error(result.error.message);
}

process.exit(result.status ?? 1);
