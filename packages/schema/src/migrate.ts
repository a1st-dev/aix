import { SCHEMA_VERSION } from './version.js';

export interface MigrationResult {
   migrated: boolean;
   fromVersion: string;
   toVersion: string;
   config: unknown;
   warnings: string[];
}

export function detectSchemaVersion(config: Record<string, unknown>): string {
   const schemaUrl = config.$schema as string | undefined;

   if (!schemaUrl) {
      return '1';
   }

   const match = schemaUrl.match(/\/v(\d+)\//);

   return match?.[1] ?? '1';
}

export function needsMigration(config: Record<string, unknown>): boolean {
   const version = detectSchemaVersion(config);

   return version !== SCHEMA_VERSION;
}

export function migrateConfig(config: Record<string, unknown>): MigrationResult {
   const fromVersion = detectSchemaVersion(config),
         warnings: string[] = [],
         migrated = { ...config };

   return {
      migrated: fromVersion !== SCHEMA_VERSION,
      fromVersion,
      toVersion: SCHEMA_VERSION,
      config: migrated,
      warnings,
   };
}
