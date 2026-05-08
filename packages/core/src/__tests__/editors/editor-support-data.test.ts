import { describe, it, expect } from 'vitest';
import {
   editorSupportProfiles,
   editorSupportProfileMap,
   listOrderedEditorPairs,
   supportedEditorNames,
} from '@a1st/aix-schema';
import { getAvailableEditors } from '../../editors/install.js';
import { ClaudeCodeHooksStrategy } from '../../editors/strategies/claude-code/hooks.js';
import { CursorHooksStrategy } from '../../editors/strategies/cursor/hooks.js';
import { CopilotHooksStrategy } from '../../editors/strategies/copilot/hooks.js';
import { WindsurfHooksStrategy } from '../../editors/strategies/windsurf/hooks.js';
import { GeminiHooksStrategy } from '../../editors/strategies/gemini/hooks.js';
import { NoHooksStrategy } from '../../editors/strategies/shared/no-hooks.js';
import type { HooksStrategy } from '../../editors/strategies/types.js';

describe('editor support data', () => {
   it('stays aligned with the runtime editor registry', () => {
      const runtimeEditors = getAvailableEditors().toSorted(),
            supportEditors = [ ...supportedEditorNames ].toSorted(),
            profileEditors = editorSupportProfiles.map((profile) => profile.id).toSorted();

      expect(supportEditors).to.eql(runtimeEditors);

      expect(profileEditors).to.eql(runtimeEditors);
   });

   it('generates one ordered pair for every distinct source and destination editor', () => {
      const pairCount = supportedEditorNames.length * (supportedEditorNames.length - 1),
            uniquePairs = new Set(listOrderedEditorPairs().map(({ from, to }) => `${from}->${to}`));

      expect(uniquePairs.size).to.eql(pairCount);
   });

   describe('hooks supportedValues align with strategy event maps', () => {
      const hookStrategies: Partial<Record<typeof supportedEditorNames[number], HooksStrategy>> = {
         'claude-code': new ClaudeCodeHooksStrategy(),
         cursor: new CursorHooksStrategy(),
         copilot: new CopilotHooksStrategy(),
         windsurf: new WindsurfHooksStrategy(),
         gemini: new GeminiHooksStrategy(),
         codex: new NoHooksStrategy(),
         zed: new NoHooksStrategy(),
         opencode: new NoHooksStrategy(),
      };

      for (const editor of supportedEditorNames) {
         const strategy = hookStrategies[editor];

         it(`${editor} matrix supportedValues match the strategy native names`, () => {
            const profile = editorSupportProfileMap[editor];

            if (!strategy) {
               throw new Error(`Hook strategy missing for ${editor}`);
            }

            const matrixValues = new Set(profile.features.hooks.supportedValues ?? []),
                  strategyValues = new Set(strategy.getNativeEventNames());

            expect(strategyValues).to.eql(matrixValues);
         });
      }
   });
});
