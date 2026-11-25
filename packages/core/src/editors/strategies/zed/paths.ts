import { getRuntimeAdapter } from '../../../runtime/index.js';

/**
 * Zed's config directory relative to the home directory. Zed keeps it under the roaming
 * application data directory on Windows and under `.config` everywhere else, including macOS.
 */
export function getGlobalZedDir(): string {
   return getRuntimeAdapter().os.platform() === 'win32' ? 'AppData/Roaming/Zed' : '.config/zed';
}
