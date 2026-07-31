#!/usr/bin/env node
// Run the aix CLI from TypeScript source. The built aix binary remains stable until rebuilt.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageTsx = join(packageRoot, 'node_modules', '.bin', 'tsx');
const workspaceTsx = join(packageRoot, '..', '..', 'node_modules', '.bin', 'tsx');
const tsx = existsSync(packageTsx) ? packageTsx : workspaceTsx;
const entry = join(packageRoot, 'src', 'cli.ts');
const result = spawnSync(tsx, [entry, ...process.argv.slice(2)], { stdio: 'inherit' });

process.exit(result.status ?? 1);
