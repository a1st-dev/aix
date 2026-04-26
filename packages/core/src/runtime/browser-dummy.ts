import { UnsupportedRuntimeCapabilityError } from '../errors.js';
import type {
   RuntimeAdapter,
   RuntimeCryptoAdapter,
   RuntimeFileSystemAdapter,
   RuntimeGitAdapter,
   RuntimeNetworkAdapter,
   RuntimeNpmAdapter,
   RuntimeOSAdapter,
   RuntimeProcessAdapter,
} from './types.js';

function unsupported(capability: string, action: string): never {
   throw new UnsupportedRuntimeCapabilityError(capability, action);
}

const unsupportedGitAdapter: RuntimeGitAdapter = {
   downloadTemplate: async () => {
      return unsupported('git-download', 'downloading git content');
   },
};

const unsupportedNpmAdapter: RuntimeNpmAdapter = {
   ensureDependencyInstalled: async () => {
      return unsupported('npm-install', 'installing npm dependencies');
   },
   resolvePackagePath: async () => {
      return unsupported('npm-resolution', 'resolving npm package paths');
   },
};

export const nodeRuntimeAdapter: RuntimeAdapter = {
   get crypto(): RuntimeCryptoAdapter {
      return unsupported('node-crypto', 'using the default Node runtime adapter');
   },
   get fs(): RuntimeFileSystemAdapter {
      return unsupported('node-fs', 'using the default Node runtime adapter');
   },
   get git(): RuntimeGitAdapter {
      return unsupportedGitAdapter;
   },
   host: {
      supportsGlobalHomeAccess: () => {
         return false;
      },
   },
   get network(): RuntimeNetworkAdapter {
      return unsupported('node-network', 'using the default Node runtime adapter');
   },
   get npm(): RuntimeNpmAdapter {
      return unsupportedNpmAdapter;
   },
   get os(): RuntimeOSAdapter {
      return unsupported('node-os', 'using the default Node runtime adapter');
   },
   get process(): RuntimeProcessAdapter {
      return unsupported('node-process', 'using the default Node runtime adapter');
   },
};
