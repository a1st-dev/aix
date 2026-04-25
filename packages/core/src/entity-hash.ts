import { getRuntimeAdapter } from './runtime/index.js';
import type { LockEntitySection, LockedEntity, LockedFile } from '@a1st/aix-schema';

export interface EntitySnapshotInput {
   name: string;
   section: LockEntitySection;
   content: string;
   source?: unknown;
   resolved?: Record<string, unknown>;
   metadata?: unknown;
   files?: LockedFile[];
}

export interface EntitySnapshotDiff {
   added: string[];
   removed: string[];
   changed: string[];
   unchanged: string[];
}

type HashAlgorithm = 'sha256' | 'sha512';

export function canonicalJson(value: unknown): string {
   if (value === null) {
      return 'null';
   }

   if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`;
   }

   switch (typeof value) {
   case 'boolean':
      return value ? 'true' : 'false';
   case 'number':
      if (!Number.isFinite(value)) {
         throw new Error('Cannot canonicalize non-finite JSON number');
      }
      return JSON.stringify(value);
   case 'string':
      return JSON.stringify(value);
   case 'object':
      return canonicalJsonObject(value);
   default:
      throw new Error(`Cannot canonicalize ${typeof value} value`);
   }
}

export function hashBytes(content: string | Uint8Array, algorithm: HashAlgorithm = 'sha256'): string {
   const hash = getRuntimeAdapter().crypto.createHash(algorithm);

   hash.update(content);

   return `${algorithm}:${hash.digest('hex')}`;
}

export function hashCanonicalJson(value: unknown): string {
   return hashBytes(canonicalJson(value));
}

export function integrityForBytes(content: string | Uint8Array): string {
   const hash = getRuntimeAdapter().crypto.createHash('sha512');

   hash.update(content);

   return `sha512-${hash.digest('base64')}`;
}

export function byteLength(content: string | Uint8Array): number {
   if (typeof content === 'string') {
      return getRuntimeAdapter().fs.byteLength(content);
   }
   return content.byteLength;
}

export function createEntitySnapshot(input: EntitySnapshotInput): LockedEntity {
   const metadataDigest = input.metadata === undefined ? undefined : hashCanonicalJson(input.metadata),
         fileContent = input.files ? canonicalJson(input.files) : input.content,
         integrity = integrityForBytes(fileContent),
         payload = {
            files: input.files,
            integrity,
            metadataDigest,
            name: input.name,
            resolved: input.resolved,
            section: input.section,
            source: input.source,
            size: byteLength(fileContent),
         },
         snapshot: LockedEntity = {
            name: input.name,
            section: input.section,
            digest: hashCanonicalJson(payload),
            integrity,
            size: byteLength(fileContent),
         };

   if (input.source !== undefined) {
      snapshot.source = input.source;
   }
   if (input.resolved !== undefined) {
      snapshot.resolved = input.resolved;
   }
   if (metadataDigest !== undefined) {
      snapshot.metadataDigest = metadataDigest;
   }
   if (input.files) {
      snapshot.files = input.files;
   }

   return snapshot;
}

export function diffEntitySnapshots(
   before: Record<string, LockedEntity>,
   after: Record<string, LockedEntity>,
): EntitySnapshotDiff {
   const added: string[] = [],
         removed: string[] = [],
         changed: string[] = [],
         unchanged: string[] = [];

   for (const name of Object.keys(after).toSorted()) {
      const previous = before[name],
            current = after[name];

      if (!current) {
         continue;
      }
      if (!previous) {
         added.push(name);
         continue;
      }
      if (previous.digest === current.digest) {
         unchanged.push(name);
         continue;
      }
      changed.push(name);
   }

   for (const name of Object.keys(before).toSorted()) {
      if (!after[name]) {
         removed.push(name);
      }
   }

   return { added, removed, changed, unchanged };
}

function canonicalJsonObject(value: object): string {
   const record = value as Record<string, unknown>,
         entries = Object.keys(record)
            .filter((key) => record[key] !== undefined)
            .toSorted()
            .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);

   return `{${entries.join(',')}}`;
}
