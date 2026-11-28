import { render } from 'ink';
import { SearchApp } from './components/SearchApp.js';
import type { SearchUIProps, InstallItem } from './types.js';

export type RenderSearchUIOptions = Omit<SearchUIProps, 'onExit'>;

export interface RenderSearchUIResult {
   /** Items installed during the search session */
   installedItems: InstallItem[];
}

export async function renderSearchUI(options: RenderSearchUIOptions): Promise<RenderSearchUIResult> {
   let installedItems: InstallItem[] = [];

   const { waitUntilExit } = render(
      <SearchApp
         {...options}
         onExit={(items) => {
            installedItems = items;
         }}
      />,
      {
         // Explicitly use process.stdin/stdout to avoid any oclif interference
         stdin: process.stdin,
         stdout: process.stdout,
         // The UI handles Ctrl+C like Esc, so the command can still list what was installed
         exitOnCtrlC: false,
      },
   );

   await waitUntilExit();

   return { installedItems };
}
