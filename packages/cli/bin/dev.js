#!/usr/bin/env node

import { register } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve ts-exec from this file's directory, not cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
register('@poppinss/ts-exec', new URL(`file://${__dirname}/`));

const { execute } = await import('@oclif/core');

await execute({ development: true, dir: import.meta.url });
