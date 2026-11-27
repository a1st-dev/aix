import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { aiJsonConfigSchema } from '../src/config.js';
import { SCHEMA_VERSION, SCHEMA_BASE_URL } from '../src/version.js';

async function generateSchema() {
   const { $schema, ...configSchema } = z.toJSONSchema(aiJsonConfigSchema, { target: 'draft-07', io: 'input' }),
         schema = {
            $schema,
            $id: `${SCHEMA_BASE_URL}/v${SCHEMA_VERSION}/ai.json`,
            title: 'ai.json Configuration',
            description: 'Configuration file for aix - unified AI agent and editor configuration',
            $ref: '#/definitions/AiJsonConfig',
            definitions: { AiJsonConfig: configSchema },
         };

   const outputPath = resolve(process.cwd(), 'schema.json');

   await writeFile(outputPath, JSON.stringify(schema, null, 2), 'utf-8');

   console.log(`Generated JSON Schema at ${outputPath}`);
}

generateSchema().catch((error) => {
   console.error('Failed to generate schema:', error);
   process.exit(1);
});
