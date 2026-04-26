import { describe, it, expect } from 'vitest';
import {
   editorSupportProfiles,
   listOrderedEditorPairs,
   supportedEditorNames,
} from '@a1st/aix-schema';
import { getAvailableEditors } from '../../editors/install.js';

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
});
