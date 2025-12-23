import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { aiJsonConfigSchema } from '../src/config.js';
import { SCHEMA_VERSION, SCHEMA_BASE_URL } from '../src/version.js';

async function generateSchema() {
   const jsonSchema = zodToJsonSchema(aiJsonConfigSchema, {
      name: 'AiJsonConfig',
      $refStrategy: 'none',
   });

   const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `${SCHEMA_BASE_URL}/v${SCHEMA_VERSION}/ai.json`,
      title: 'ai.json Configuration',
      description: 'Configuration file for aix - unified AI agent and editor configuration',
      ...jsonSchema,
   };

   const outputPath = resolve(process.cwd(), 'schema.json');

   await writeFile(outputPath, JSON.stringify(schema, null, 2), 'utf-8');

   console.log(`Generated JSON Schema at ${outputPath}`);
}

generateSchema().catch((error) => {
   console.error('Failed to generate schema:', error);
   process.exit(1);
});
