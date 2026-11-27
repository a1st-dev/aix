import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getRuntimeAdapter, isRecord, replaceFile } from '@a1st/aix-core';

export const CHECK_FOR_UPDATES_KEY = 'checkForUpdates';

function getSettingsPath(): string {
   return join(getRuntimeAdapter().os.homedir(), '.aix', 'settings.json');
}

async function readSettings(path: string): Promise<Record<string, unknown>> {
   let content: string;

   try {
      content = await readFile(path, 'utf8');
   } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') {
         return {};
      }

      throw error;
   }

   const settings: unknown = JSON.parse(content);

   if (!isRecord(settings)) {
      throw new Error(`Expected a JSON object in ${path}.`);
   }

   return settings;
}

export async function getCheckForUpdates(): Promise<boolean> {
   const settings = await readSettings(getSettingsPath());

   return settings[CHECK_FOR_UPDATES_KEY] !== false;
}

export async function setCheckForUpdates(value: boolean): Promise<void> {
   const path = getSettingsPath(),
         settings = await readSettings(path);

   await replaceFile(path, JSON.stringify({ ...settings, [CHECK_FOR_UPDATES_KEY]: value }, null, 3) + '\n');
}
