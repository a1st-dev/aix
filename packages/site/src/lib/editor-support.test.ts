import { describe, expect, it } from 'vitest';
import {
   editorFeatureDefinitions,
   editorSupportProfiles,
   formatEditorNameList,
   formatList,
   getEditorById,
   getFeatureConceptRoute,
   getFeatureProseLabel,
   getMigrationDescription,
   getMigrationRows,
   indexableMigrationPairs,
   isIndexableMigrationPair,
   isIndexableMigrationSitemapURL,
   listChangedMigrationRows,
   listMigrationPairsForEditor,
   managedEditorFeatures,
} from './editor-support';
import { getEditorSupportHeadings, getEditorSupportPage } from './editor-pages';

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

describe('feature labels in prose', () => {
   it('lowercases plain words and keeps acronyms and file names as written', () => {
      const labels = Object.fromEntries(editorFeatureDefinitions.map((feature) => {
         return [ feature.id, getFeatureProseLabel(feature) ];
      }));

      expect(labels.rules).toStrictEqual('rules');
      expect(labels.marketplaces).toStrictEqual('marketplaces');
      expect(labels.mcp).toStrictEqual('MCP');
      expect(labels['agents-md']).toStrictEqual('AGENTS.md');
      expect(labels['agents-dir']).toStrictEqual('.agents/skills');
   });

   it('keeps acronym casing in migration descriptions', () => {
      const description = getMigrationDescription(
         getEditorById('cursor'),
         getEditorById('zed'),
         getMigrationRows('cursor', 'zed'),
      );

      expect(description).not.toMatch(/\bmcp\b|agents\.md/u);
   });

   it('names every managed feature in the editor page description', () => {
      const { description } = getEditorSupportPage({ name: 'Cursor' });

      expect(description).toContain('rules, prompts, MCP, skills, agents, hooks, plugins, and marketplaces');
   });
});

describe('list formatting', () => {
   it('joins one, two and many items the way English does', () => {
      expect(formatList([])).toStrictEqual('');
      expect(formatList([ 'rules' ])).toStrictEqual('rules');
      expect(formatList([ 'rules', 'hooks' ])).toStrictEqual('rules and hooks');
      expect(formatList([ 'rules', 'MCP', 'hooks' ])).toStrictEqual('rules, MCP, and hooks');
      expect(formatEditorNameList([ { name: 'Cursor' }, { name: 'Zed' } ])).toStrictEqual('Cursor and Zed');
   });
});

describe('concept links', () => {
   it('links every managed feature to a concept page', () => {
      const unlinked = managedEditorFeatures.filter((feature) => {
         return getFeatureConceptRoute(feature.id) === undefined;
      });

      expect(unlinked).toEqual([]);
   });
});

describe('migration guides for one editor', () => {
   it('lists every guide that starts from or ends at the editor, outgoing first', () => {
      const pairs = listMigrationPairsForEditor('zed'),
            otherEditorCount = editorSupportProfiles.length - 1;

      expect(pairs).toHaveLength(otherEditorCount * 2);
      expect(pairs.slice(0, otherEditorCount).every((pair) => {
         return pair.from === 'zed';
      })).toStrictEqual(true);
      expect(pairs.slice(otherEditorCount).every((pair) => {
         return pair.to === 'zed';
      })).toStrictEqual(true);
   });
});

describe('editor page headings', () => {
   it('lists one heading per feature under the feature details section', () => {
      const profile = getEditorById('cursor'),
            headings = getEditorSupportHeadings(profile),
            featureHeadings = headings.filter((heading) => {
               return heading.depth === 3;
            });

      expect(featureHeadings.map((heading) => {
         return heading.text;
      })).toEqual(editorFeatureDefinitions.map((feature) => {
         return feature.label;
      }));
      expect(new Set(headings.map((heading) => {
         return heading.slug;
      })).size).toStrictEqual(headings.length);
   });
});

describe('changed migration rows', () => {
   it('lists lost support before gains and before plain differences', () => {
      const changeTypes = listChangedMigrationRows(getMigrationRows('cursor', 'codex')).map((row) => {
               return row.changeType;
            }),
            firstDifference = changeTypes.indexOf('difference');

      expect(changeTypes).not.toContain('same');
      expect(changeTypes[0]).toStrictEqual('tradeoff');
      expect(changeTypes.slice(firstDifference).every((changeType) => {
         return changeType === 'difference';
      })).toStrictEqual(true);
   });
});
