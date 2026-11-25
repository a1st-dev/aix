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
      items: [
         { autogenerate: { directory: 'concepts' } },
      ],
   },
   {
      label: 'Configuration',
      items: [
         { autogenerate: { directory: 'configuration' } },
      ],
   },
   {
      label: 'CLI reference',
      items: [
         { autogenerate: { directory: 'cli' } },
      ],
   },
   {
      label: 'Editors',
      items: [
         {
            label: 'Supported editors',
            link: '/editors/supported-editors/',
         },
         {
            label: 'By editor',
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
];
