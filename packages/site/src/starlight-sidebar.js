import { editorSupportProfiles } from '@a1st/aix-schema';

const editorDetailLinks = editorSupportProfiles.map((profile) => ({
   label: profile.name,
   link: `/editors/${profile.id}/`,
}));

export const docsSidebar = [
   {
      label: 'Getting Started',
      autogenerate: { directory: 'getting-started' },
   },
   {
      label: 'Configuration',
      autogenerate: { directory: 'configuration' },
   },
   {
      label: 'Concepts',
      autogenerate: { directory: 'concepts' },
   },
   {
      label: 'CLI Reference',
      autogenerate: { directory: 'cli' },
   },
   {
      label: 'Editors',
      items: [
         {
            label: 'Supported Editors',
            link: '/editors/supported-editors/',
         },
         {
            label: 'By editor',
            items: editorDetailLinks,
         },
         {
            label: 'Migration Guides',
            link: '/editors/migrations/',
         },
      ],
   },
];
