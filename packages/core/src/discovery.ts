import { resolve, dirname, join } from 'pathe';
import { parseJsonc } from '@a1st/aix-schema';
import { getRuntimeAdapter } from './runtime/index.js';

export interface DiscoveryResult {
   path: string;
   content: string;
   source: 'file' | 'package.json';
   /** Set when ai.json takes precedence but package.json also has an ai field */
   packageJsonAlsoHasAi?: boolean;
   /** Path to ai.local.json if it exists */
   localPath?: string;
   /** Content of ai.local.json if it exists */
   localContent?: string;
}

export async function discoverConfig(
   startDir: string = getRuntimeAdapter().process.cwd(),
   explicitPath?: string,
): Promise<DiscoveryResult | undefined> {
   const { fs } = getRuntimeAdapter();

   if (explicitPath) {
      const absolutePath = resolve(startDir, explicitPath);

      if (fs.existsSync(absolutePath)) {
         return {
            path: absolutePath,
            content: fs.readFileSync(absolutePath, 'utf-8'),
            source: 'file',
         };
      }
      return undefined;
   }

   let currentDir = resolve(startDir);

   while (true) {
      const aiJsonPath = join(currentDir, 'ai.json'),
            packageJsonPath = join(currentDir, 'package.json'),
            hasAiJson = fs.existsSync(aiJsonPath);

      // Check if package.json has an ai field (for warning detection)
      let packageJsonHasAi = false;
      let packageJson: Record<string, unknown> | undefined;

      if (fs.existsSync(packageJsonPath)) {
         packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
         packageJsonHasAi = packageJson.ai !== undefined;
      }

      // Check for ai.local.json
      const localJsonPath = join(currentDir, 'ai.local.json'),
            hasLocalJson = fs.existsSync(localJsonPath);

      // ai.json takes precedence
      if (hasAiJson) {
         const result: DiscoveryResult = {
            path: aiJsonPath,
            content: fs.readFileSync(aiJsonPath, 'utf-8'),
            source: 'file',
            packageJsonAlsoHasAi: packageJsonHasAi,
         };

         if (hasLocalJson) {
            result.localPath = localJsonPath;
            result.localContent = fs.readFileSync(localJsonPath, 'utf-8');
         }

         return result;
      }

      // Fall back to package.json ai field
      if (packageJson?.ai) {
         let result: DiscoveryResult | undefined;

         if (typeof packageJson.ai === 'string') {
            const referencedPath = resolve(currentDir, packageJson.ai);

            if (fs.existsSync(referencedPath)) {
               result = {
                  path: referencedPath,
                  content: fs.readFileSync(referencedPath, 'utf-8'),
                  source: 'file',
               };
            }
         } else {
            result = {
               path: packageJsonPath,
               content: JSON.stringify(packageJson.ai),
               source: 'package.json',
            };
         }

         if (result) {
            if (hasLocalJson) {
               result.localPath = localJsonPath;
               result.localContent = fs.readFileSync(localJsonPath, 'utf-8');
            }
            return result;
         }
      }

      // ai.local.json alone (no ai.json, no package.json ai field) - use empty base config
      if (hasLocalJson) {
         return {
            path: localJsonPath, // Use local path as the "path" for context
            content: '{}', // Empty base config
            source: 'file',
            localPath: localJsonPath,
            localContent: fs.readFileSync(localJsonPath, 'utf-8'),
         };
      }

      const parentDir = dirname(currentDir);

      if (currentDir === parentDir) {
         break;
      }
      currentDir = parentDir;
   }

   return undefined;
}

export function parseConfigContent(content: string): unknown {
   const result = parseJsonc(content);

   if (result.errors.length > 0) {
      const firstError = result.errors[0];

      throw new Error(`Parse error at offset ${firstError?.offset}: ${firstError?.message}`);
   }

   return result.data;
}
