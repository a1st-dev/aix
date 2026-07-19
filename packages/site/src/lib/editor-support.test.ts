import { describe, expect, it } from 'vitest';
import {
   indexableMigrationPairs,
   isIndexableMigrationPair,
   isIndexableMigrationSitemapURL,
} from './editor-support';

describe('indexable migration guides', () => {
   it('keeps the six featured directions eligible for indexing', () => {
      expect(indexableMigrationPairs).toHaveLength(6);
      expect(isIndexableMigrationPair('cursor', 'codex')).toStrictEqual(true);
      expect(isIndexableMigrationPair('codex', 'cursor')).toStrictEqual(true);
      expect(isIndexableMigrationPair('claude-code', 'codex')).toStrictEqual(true);
      expect(isIndexableMigrationPair('codex', 'claude-code')).toStrictEqual(true);
   });

   it('excludes unfeatured generated routes from the sitemap without excluding other pages', () => {
      expect(
         isIndexableMigrationSitemapURL('https://aix.a1st.dev/editors/migrations/how-to-migrate-from-cursor-to-copilot/'),
      ).toStrictEqual(false);
      expect(
         isIndexableMigrationSitemapURL('https://aix.a1st.dev/editors/migrations/how-to-migrate-from-cursor-to-codex/'),
      ).toStrictEqual(true);
      expect(isIndexableMigrationSitemapURL('https://aix.a1st.dev/getting-started/quick-start/')).toStrictEqual(true);
   });
});
