import { render } from 'ink';
import { SearchApp } from './components/SearchApp.js';
import type { SearchUIProps, InstallItem } from './types.js';

export interface RenderSearchUIOptions extends Omit<SearchUIProps, 'onExit'> {
   onInstall: (item: InstallItem) => Promise<boolean>;
   onUninstall?: (item: InstallItem) => Promise<boolean>;
}

export interface RenderSearchUIResult {
   /** Items installed during the search session */
   installedItems: InstallItem[];
}

export async function renderSearchUI(options: RenderSearchUIOptions): Promise<RenderSearchUIResult> {
   return new Promise((resolve, reject) => {
      try {
         const { unmount, waitUntilExit } = render(
            <SearchApp
               {...options}
               onExit={(installedItems) => {
                  unmount();
                  resolve({ installedItems });
               }}
            />,
            {
               // Explicitly use process.stdin/stdout to avoid any oclif interference
               stdin: process.stdin,
               stdout: process.stdout,
            },
         );

         waitUntilExit().catch(reject);
      } catch (error) {
         reject(error);
      }
   });
}
