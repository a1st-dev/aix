#!/usr/bin/env node

import { execute } from '@oclif/core';
import { fileURLToPath } from 'node:url';

const development = import.meta.url.endsWith('/src/cli.ts'),
      root = fileURLToPath(new URL('..', import.meta.url));

await execute({ development, loadOptions: { root, ignoreManifest: development } });
