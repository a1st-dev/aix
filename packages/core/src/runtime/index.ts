import { nodeRuntimeAdapter } from './node.js';
import type { RuntimeAdapter } from './types.js';

let activeRuntimeAdapter: RuntimeAdapter = nodeRuntimeAdapter;

export { nodeRuntimeAdapter };
export type {
   RuntimeAdapter,
   RuntimeCopyOptions,
   RuntimeGitAdapter,
   RuntimeGitDownloadOptions,
   RuntimeGitDownloadResult,
   RuntimeDirent,
   RuntimeEncoding,
   RuntimeFetchInit,
   RuntimeFetchResponse,
   RuntimeFileSystemAdapter,
   RuntimeHostAdapter,
   RuntimeMkdirOptions,
   RuntimeNetworkAdapter,
   RuntimeNpmAdapter,
   RuntimeOSAdapter,
   RuntimeProcessAdapter,
   RuntimeReaddirOptions,
   RuntimeRemoveOptions,
   RuntimeStats,
   RuntimeSymlinkType,
} from './types.js';

export function getRuntimeAdapter(): RuntimeAdapter {
   return activeRuntimeAdapter;
}

export function setRuntimeAdapter(adapter: RuntimeAdapter): void {
   activeRuntimeAdapter = adapter;
}

export function resetRuntimeAdapter(): void {
   activeRuntimeAdapter = nodeRuntimeAdapter;
}

export async function withRuntimeAdapter<T>(adapter: RuntimeAdapter, callback: () => Promise<T>): Promise<T> {
   const previousAdapter = activeRuntimeAdapter;

   activeRuntimeAdapter = adapter;

   try {
      return await callback();
   } finally {
      activeRuntimeAdapter = previousAdapter;
   }
}
