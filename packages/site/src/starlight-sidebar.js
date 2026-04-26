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
            label: 'Editor-Specific Notes',
            link: '/editors/editor-specific-notes/',
         },
         {
            label: 'Migration Guides',
            link: '/editors/migrations/',
         },
      ],
   },
];
