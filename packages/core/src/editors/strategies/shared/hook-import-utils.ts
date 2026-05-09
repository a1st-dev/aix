import { parseJsonc, type HookAction, type HookEvent, type HooksConfig, type HookMatcher } from '@a1st/aix-schema';

export interface ImportedHookEntry {
   action: HookAction;
   matcher?: string;
   sequential?: boolean;
}

export interface ImportedHookObject {
   rawHooks: Record<string, unknown> | null;
   warnings: string[];
}

export interface MatcherHookImportOptions {
   eventMap: Record<string, string>;
   parseAction: (value: unknown) => HookAction | null;
   toolMatchers?: Record<string, string>;
   normalizeMatcher?: (matcher: string | undefined) => string | undefined;
   readSequential?: (value: Record<string, unknown>) => boolean | undefined;
}

export function parseHookObject(content: string): ImportedHookObject {
   const parsed = parseJsonc<{ hooks?: Record<string, unknown> }>(content),
         warnings = parsed.errors.map((error) => `Failed to parse hooks config: ${error.message}`),
         rawHooks = parsed.data?.hooks;

   if (!rawHooks || typeof rawHooks !== 'object') {
      return { rawHooks: null, warnings };
   }

   return { rawHooks, warnings };
}

export function parseFlatImportedHooks(
   rawHooks: Record<string, unknown>,
   eventMap: Record<string, string>,
   parseEntry: (value: unknown) => ImportedHookEntry | null,
): HooksConfig {
   const hooks: HooksConfig = {},
         reverseEventMap: Record<string, HookEvent> = {};

   for (const [event, nativeEvent] of Object.entries(eventMap)) {
      reverseEventMap[nativeEvent] = event as HookEvent;
   }

   for (const [nativeEvent, rawEntries] of Object.entries(rawHooks)) {
      const event = reverseEventMap[nativeEvent];

      if (!event || !Array.isArray(rawEntries)) {
         continue;
      }

      for (const rawEntry of rawEntries) {
         const entry = parseEntry(rawEntry);

         if (entry) {
            pushImportedHookEntry(hooks, event, entry);
         }
      }
   }

   return hooks;
}

export function parseMatcherImportedHooks(
   rawHooks: Record<string, unknown>,
   options: MatcherHookImportOptions,
): HooksConfig {
   const hooks: HooksConfig = {};

   for (const [nativeEvent, rawMatchers] of Object.entries(rawHooks)) {
      if (!Array.isArray(rawMatchers)) {
         continue;
      }

      for (const rawMatcher of rawMatchers) {
         if (!rawMatcher || typeof rawMatcher !== 'object') {
            continue;
         }

         const matcherValue = rawMatcher as Record<string, unknown>,
               matcher = options.normalizeMatcher?.(
                  typeof matcherValue.matcher === 'string' ? matcherValue.matcher : undefined,
               ) ?? (typeof matcherValue.matcher === 'string' ? matcherValue.matcher : undefined),
               event = resolveMatcherBackedEvent(nativeEvent, matcher, options.eventMap, options.toolMatchers);

         if (!event || !Array.isArray(matcherValue.hooks)) {
            continue;
         }

         const actions = matcherValue.hooks
            .map((action) => options.parseAction(action))
            .filter((action): action is HookAction => action !== null);

         if (actions.length === 0) {
            continue;
         }

         const importedMatcher = normalizeImportedMatcher(event, matcher, options.toolMatchers),
               group: HookMatcher = { hooks: actions };

         if (importedMatcher) {
            group.matcher = importedMatcher;
         }

         const sequential = options.readSequential?.(matcherValue);

         if (sequential !== undefined) {
            group.sequential = sequential;
         }

         hooks[event] = [ ...(hooks[event] ?? []), group ];
      }
   }

   return hooks;
}

function normalizeImportedMatcher(
   event: HookEvent,
   matcher: string | undefined,
   toolMatchers: Record<string, string> = {},
): string | undefined {
   if (!matcher) {
      return undefined;
   }

   return toolMatchers[event] === matcher ? undefined : matcher;
}

function pushImportedHookEntry(hooks: HooksConfig, event: HookEvent, entry: ImportedHookEntry): void {
   const existing = (hooks[event] ?? []).find((matcher: HookMatcher) => {
      return matcher.matcher === entry.matcher && matcher.sequential === entry.sequential;
   });

   if (existing) {
      existing.hooks.push(entry.action);
      return;
   }

   const matcher: HookMatcher = { hooks: [entry.action] };

   if (entry.matcher) {
      matcher.matcher = entry.matcher;
   }
   if (entry.sequential !== undefined) {
      matcher.sequential = entry.sequential;
   }

   hooks[event] = [ ...(hooks[event] ?? []), matcher ];
}

function resolveMatcherBackedEvent(
   nativeEvent: string,
   matcher: string | undefined,
   eventMap: Record<string, string>,
   toolMatchers: Record<string, string> = {},
): HookEvent | null {
   const matchingEvents = Object.entries(eventMap)
      .filter(([, mappedEvent]) => mappedEvent === nativeEvent)
      .map(([event]) => event as HookEvent);

   if (matchingEvents.length === 0) {
      return null;
   }

   for (const event of matchingEvents) {
      if (toolMatchers[event] === matcher) {
         return event;
      }
   }

   return matchingEvents.find((event) => !toolMatchers[event]) ?? matchingEvents[0] ?? null;
}
