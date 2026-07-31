#!/usr/bin/env node

import { execute } from '@oclif/core';

const development = import.meta.url.endsWith('/src/cli.ts');

await execute({ development, dir: import.meta.url });
