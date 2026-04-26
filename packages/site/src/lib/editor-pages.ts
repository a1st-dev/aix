import type { EditorSupportProfile } from '@a1st/aix-schema';

export const supportedEditorsPage = Object.freeze({
   title: 'Supported Editors',
   description: 'Feature support matrix for all editors detected by aix, with links to per-editor support details.',
});

export const migrationGuidesPage = Object.freeze({
   title: 'Migration Guides',
   description: 'Programmatic editor-to-editor migration guides for every supported aix editor pair.',
});

export function getEditorSupportPage(profile: Pick<EditorSupportProfile, 'name'>): { description: string; title: string } {
   return {
      title: `${profile.name} support details`,
      description: `How aix maps rules, prompts, MCP, skills, hooks, and compatibility surfaces for ${profile.name}.`,
   };
}
