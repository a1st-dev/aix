import { editorSupportProfiles } from '@a1st/aix-schema';

const editorDetailLinks = editorSupportProfiles.map((profile) => ({
   label: profile.name,
   link: `/editors/${profile.id}/`,
}));

export const docsSidebar = [
   {
      label: 'Getting started',
      items: [
         { autogenerate: { directory: 'getting-started' } },
      ],
   },
   {
      label: 'Concepts',
      collapsed: true,
      items: [
         { autogenerate: { directory: 'concepts' } },
      ],
   },
   {
      label: 'Configuration',
      collapsed: true,
      items: [
         { autogenerate: { directory: 'configuration' } },
      ],
   },
   {
      label: 'CLI reference',
      collapsed: true,
      items: [
         { autogenerate: { directory: 'cli' } },
      ],
   },
   {
      label: 'Editors',
      collapsed: true,
      items: [
         {
            label: 'Supported editors',
            link: '/editors/supported-editors/',
         },
         {
            label: 'By editor',
            collapsed: true,
            items: editorDetailLinks,
         },
         {
            label: 'Migration guides',
            link: '/editors/migrations/',
         },
         {
            label: 'Editor changelog',
            link: '/editors/changelog/',
         },
      ],
   },
   {
      label: 'Changelog',
      link: '/changelog/',
   },
];
