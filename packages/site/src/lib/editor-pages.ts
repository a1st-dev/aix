import type { MarkdownHeading } from 'astro';
import type { EditorSupportProfile } from '@a1st/aix-schema';
import {
   editorFeatureDefinitions,
   formatList,
   getFeatureAnchor,
   getFeatureProseLabel,
   managedEditorFeatures,
} from './editor-support';

const SECTION_DEPTH = 2,
      SUBSECTION_DEPTH = 3;

/**
 * A section heading on a generated page. Templates render the heading from the same object
 * that feeds Starlight's "On this page" list, so the two cannot drift apart.
 */
function defineSection(slug: string, text: string, depth: number = SECTION_DEPTH): MarkdownHeading {
   return { depth, slug, text };
}

export const supportedEditorsPage = Object.freeze({
   title: 'Supported editors',
   description: 'Feature support matrix for every editor aix can install to, with links to per-editor details.',
   sections: Object.freeze({
      matrix: defineSection('support-matrix', 'Support matrix'),
      features: defineSection('features', 'What each column means'),
      sync: defineSection('sync-behavior', 'Sync behavior'),
   }),
});

export const migrationGuidesPage = Object.freeze({
   title: 'Migration guides',
   description: 'Editor-to-editor migration guides for every pair of editors aix supports.',
   sections: Object.freeze({
      featured: defineSection('featured', 'Featured guides'),
   }),
});

export const editorChangelogPage = Object.freeze({
   title: 'Editor changelog',
   description: 'Editor releases the aix maintainers have reviewed, and whether each change affects what aix writes.',
});

export const editorSupportSections = Object.freeze({
   notes: defineSection('editor-notes', 'Editor-specific notes'),
   features: defineSection('feature-details', 'Feature details'),
   guides: defineSection('related-guides', 'Related guides'),
});

export const migrationGuideSections = Object.freeze({
   run: defineSection('run-this-migration', 'Run this migration'),
   attention: defineSection('what-needs-attention', 'What needs attention'),
   comparison: defineSection('feature-comparison', 'Feature comparison'),
   links: defineSection('related-pages', 'Related pages'),
});

export function getMigrationFromSection(profile: Pick<EditorSupportProfile, 'id' | 'name'>): MarkdownHeading {
   return defineSection(profile.id, `From ${profile.name}`);
}

export function getEditorSupportPage(profile: Pick<EditorSupportProfile, 'name'>): { description: string; title: string } {
   const featureList = formatList(managedEditorFeatures.map(getFeatureProseLabel));

   return {
      title: `${profile.name} support details`,
      description: `How aix maps ${featureList} to ${profile.name}, with project and user paths.`,
   };
}

export function getEditorSupportHeadings(profile: Pick<EditorSupportProfile, 'id' | 'notes'>): MarkdownHeading[] {
   const featureHeadings = editorFeatureDefinitions.map((feature) => {
      return defineSection(getFeatureAnchor(profile.id, feature.id), feature.label, SUBSECTION_DEPTH);
   });

   return [
      ...(profile.notes.length > 0 ? [ editorSupportSections.notes ] : []),
      editorSupportSections.features,
      ...featureHeadings,
      editorSupportSections.guides,
   ];
}
