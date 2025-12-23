import { useState, useCallback, useRef } from 'react';
import type { SearchResult, SearchType } from '../../../lib/search/types.js';
import type { InstallItem } from '../types.js';

interface UseInstallOptions {
   alreadyInstalled: Set<string>;
   onInstall: (item: InstallItem) => Promise<boolean>;
   onUninstall?: (item: InstallItem) => Promise<boolean>;
}

interface UseInstallReturn {
   installedItems: Set<string>;
   installingItem: string | null;
   uninstallingItem: string | null;
   installedRef: React.MutableRefObject<InstallItem[]>;
   installItem: (result: SearchResult | null, type: SearchType) => Promise<void>;
   uninstallItem: (result: SearchResult | null, type: SearchType) => Promise<void>;
}

export function useInstall({ alreadyInstalled, onInstall, onUninstall }: UseInstallOptions): UseInstallReturn {
   const [installedThisSession, setInstalledThisSession] = useState<InstallItem[]>([]);
   const [uninstalledThisSession, setUninstalledThisSession] = useState<Set<string>>(new Set());
   const [installingItem, setInstallingItem] = useState<string | null>(null);
   const [uninstallingItem, setUninstallingItem] = useState<string | null>(null);
   const installedRef = useRef<InstallItem[]>([]);

   // Items are installed if: (already installed OR installed this session) AND NOT uninstalled this session
   const installedItems = new Set(
      [...alreadyInstalled, ...installedThisSession.map((item) => item.result.name)].filter(
         (name) => !uninstalledThisSession.has(name),
      ),
   );

   const installItem = useCallback(
      async (result: SearchResult | null, type: SearchType) => {
         if (!result || installedItems.has(result.name) || installingItem || uninstallingItem) {
            return;
         }

         setInstallingItem(result.name);
         try {
            const success = await onInstall({ result, type });

            if (success) {
               const item: InstallItem = { result, type };

               setInstalledThisSession((prev) => [...prev, item]);
               setUninstalledThisSession((prev) => {
                  const next = new Set(prev);

                  next.delete(result.name);
                  return next;
               });
               installedRef.current = [...installedRef.current, item];
            }
         } finally {
            setInstallingItem(null);
         }
      },
      [installedItems, installingItem, uninstallingItem, onInstall],
   );

   const uninstallItem = useCallback(
      async (result: SearchResult | null, type: SearchType) => {
         if (!result || !installedItems.has(result.name) || installingItem || uninstallingItem || !onUninstall) {
            return;
         }

         setUninstallingItem(result.name);
         try {
            const success = await onUninstall({ result, type });

            if (success) {
               setUninstalledThisSession((prev) => new Set([...prev, result.name]));
               setInstalledThisSession((prev) => prev.filter((item) => item.result.name !== result.name));
               installedRef.current = installedRef.current.filter((item) => item.result.name !== result.name);
            }
         } finally {
            setUninstallingItem(null);
         }
      },
      [installedItems, installingItem, uninstallingItem, onUninstall],
   );

   return { installedItems, installingItem, uninstallingItem, installedRef, installItem, uninstallItem };
}
