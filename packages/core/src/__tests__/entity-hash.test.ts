import { describe, expect, it } from 'vitest';
import {
   canonicalJson,
   createEntitySnapshot,
   diffEntitySnapshots,
   hashCanonicalJson,
} from '../entity-hash.js';

describe('entity hash helpers', () => {
   it('canonicalizes object keys recursively', () => {
      const left = { b: 2, a: { d: 4, c: 3 } },
            right = { a: { c: 3, d: 4 }, b: 2 };

      expect(canonicalJson(left)).toBe(canonicalJson(right));
      expect(hashCanonicalJson(left)).toBe(hashCanonicalJson(right));
   });

   it('changes entity digests when content changes', () => {
      const first = createEntitySnapshot({
               name: 'style',
               section: 'rules',
               content: 'Use semicolons.',
            }),
            second = createEntitySnapshot({
               name: 'style',
               section: 'rules',
               content: 'Avoid semicolons.',
            });

      expect(first.digest).not.toBe(second.digest);
   });

   it('diffs entity snapshots by name and digest', () => {
      const unchanged = createEntitySnapshot({
               name: 'same',
               section: 'prompts',
               content: 'Review this.',
            }),
            changedBefore = createEntitySnapshot({
               name: 'changed',
               section: 'prompts',
               content: 'Before',
            }),
            changedAfter = createEntitySnapshot({
               name: 'changed',
               section: 'prompts',
               content: 'After',
            }),
            added = createEntitySnapshot({
               name: 'added',
               section: 'prompts',
               content: 'Added',
            }),
            removed = createEntitySnapshot({
               name: 'removed',
               section: 'prompts',
               content: 'Removed',
            });

      const diff = diffEntitySnapshots(
         { changed: changedBefore, removed, same: unchanged },
         { added, changed: changedAfter, same: unchanged },
      );

      expect(diff).to.eql({
         added: ['added'],
         removed: ['removed'],
         changed: ['changed'],
         unchanged: ['same'],
      });
   });
});
