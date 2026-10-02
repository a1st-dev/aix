import { isAbsolute } from 'pathe';
import { getRuntimeAdapter } from '../runtime/index.js';
import { hashBytes, canonicalJson } from '../entity-hash.js';
import { isRecord } from '../type-guards.js';

async function getHookCommandContent(command: string): Promise<unknown> {
   // ponytail: only simple commands are inspected; compound commands retain exact identity.
   const words = /"[^"`\\]*"|'[^']*'|[^\s"'`\\|;&<>()]+/g;

   if (command.includes('\n') || command.includes('\r') || command.replace(words, '').trim()) {
      return command;
   }

   const content = await Promise.all((command.match(words) ?? []).map(async (word) => {
      const quoted = word.startsWith('"') || word.startsWith("'"),
            path = quoted ? word.slice(1, -1) : word,
            expandedPath = word.startsWith("'") ? path : path.replace(/^\$(?:HOME|\{HOME\})(?=[/\\])/, () => {
               return getRuntimeAdapter().os.homedir();
            });

      if (!isAbsolute(expandedPath) || (!word.startsWith("'") && expandedPath.includes('$'))) {
         return word;
      }

      try {
         return { fileContent: hashBytes(await getRuntimeAdapter().fs.readFile(expandedPath)) };
      } catch {
         // Missing or unreadable files cannot establish content equality.
         return word;
      }
   }));

   return content.some(isRecord) ? content : command;
}

export async function getNativeHookContent(value: unknown): Promise<unknown> {
   if (Array.isArray(value)) {
      return Promise.all(value.map(getNativeHookContent));
   }
   if (!isRecord(value)) {
      return value;
   }

   const entries = await Promise.all(Object.entries(value).map(async ([key, field]): Promise<[string, unknown]> => {
      if (key === 'hooks') {
         return [key, await getNativeHookContent(field)];
      }
      if (['command', 'bash', 'powershell', 'commandWindows'].includes(key) && typeof field === 'string') {
         return [key, await getHookCommandContent(field)];
      }
      return [key, field];
   }));
   const content = Object.fromEntries(entries);

   if (Array.isArray(value.hooks)) {
      content.matcher ??= '';
   }

   return content;
}

/** Grouping is editor syntax; each handler's matcher and options determine its identity. */
export async function getNativeHookKeys(value: unknown): Promise<string[]> {
   if (!isRecord(value) || !Array.isArray(value.hooks)) {
      return [canonicalJson(await getNativeHookContent(value))];
   }

   const context = Object.fromEntries(Object.entries(value).filter(([key]) => {
      return key !== 'hooks';
   }));

   context.matcher ??= '';

   return Promise.all(value.hooks.map(async (hook: unknown) => {
      return canonicalJson({ context, hook: await getNativeHookContent(hook) });
   }));
}

export async function filterNativeHooks(
   entries: unknown[],
   keep: (key: string, index: number) => boolean,
): Promise<unknown[]> {
   const keys = await Promise.all(entries.map(getNativeHookKeys));
   let index = 0;

   return entries.flatMap((entry, entryIndex) => {
      const retained = (keys[entryIndex] ?? []).map((key) => {
         return keep(key, index++);
      });

      if (isRecord(entry) && Array.isArray(entry.hooks)) {
         const hooks = entry.hooks.filter((_hook: unknown, hookIndex: number) => {
            return retained[hookIndex];
         });

         if (hooks.length === 0) {
            return [];
         }
         return hooks.length === entry.hooks.length ? [entry] : [{ ...entry, hooks }];
      }
      return retained[0] ? [entry] : [];
   });
}

export async function deduplicateNativeHooks(entries: unknown[]): Promise<unknown[]> {
   const keys = (await Promise.all(entries.map(getNativeHookKeys))).flat(),
         lastOccurrence = new Map(keys.map((key, index) => {
            return [key, index];
         }));

   return filterNativeHooks(entries, (key, index) => {
      return lastOccurrence.get(key) === index;
   });
}
