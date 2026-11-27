import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import icon from 'astro-icon';
import umami from '@yeskunall/astro-umami';
import astroLlmsTxt from '@4hse/astro-llms-txt';
import {
   editorSupportProfiles,
   formatEditorNameList,
   getEditorSupportRoute,
   getMigrationRoute,
   indexableMigrationPairs,
   isIndexableMigrationSitemapURL,
} from './src/lib/editor-support';
import { docsSidebar } from './src/starlight-sidebar.js';

const umamiWebsiteId = process.env.UMAMI_WEBSITE_ID;
const isVercelProduction = process.env.VERCEL_ENV === 'production';

if (isVercelProduction && !umamiWebsiteId) {
   throw new Error('UMAMI_WEBSITE_ID must be set for production deployments.');
}

const siteDescription = `One config file for every AI editor. Define skills, rules, prompts, MCP servers, hooks, agents, and plugins in ai.json, then install them to ${formatEditorNameList(editorSupportProfiles)}.`;

// The llms.txt integration matches page paths without a leading slash.
const toLlmsPath = (route) => route.replace(/^\//, '');

// Only the featured migration guides go into llms-full.txt. The other generated pairs
// repeat the same comparison data, and the editor changelog is a release log, not docs.
const llmsEditorPages = [
   'editors/supported-editors/',
   'editors/migrations/',
   ...editorSupportProfiles.map((profile) => toLlmsPath(getEditorSupportRoute(profile.id))),
   ...indexableMigrationPairs.map((pair) => toLlmsPath(getMigrationRoute(pair.from, pair.to))),
];

export default defineConfig({
   site: 'https://aix.a1st.dev',
   adapter: vercel(),
   integrations: [
      icon(),
      sitemap({
         filter: isIndexableMigrationSitemapURL,
      }),
      ...(umamiWebsiteId ? [umami({ id: umamiWebsiteId })] : []),
      astroLlmsTxt({
         title: 'aix',
         description: siteDescription,
         docSet: [
            {
               title: 'Complete documentation',
               description: 'Full aix documentation with all guides and references',
               url: '/llms-full.txt',
               include: [
                  '/',
                  'cli/',
                  'cli/**',
                  'concepts/',
                  'concepts/**',
                  'configuration/',
                  'configuration/**',
                  'getting-started/',
                  'getting-started/**',
                  ...llmsEditorPages,
               ],
            },
         ],
      }),
      starlight({
         title: 'aix',
         description: siteDescription,
         logo: {
            light: './src/assets/logo-light.svg',
            dark: './src/assets/logo-dark.svg',
            replacesTitle: true,
         },
         social: [
            {
               icon: 'github',
               label: 'GitHub',
               href: 'https://github.com/a1st-dev/aix',
            },
         ],
         customCss: ['./src/styles/fonts.css', './src/styles/theme.scss', './src/styles/docs.scss'],
         expressiveCode: {
            themes: ['vitesse-dark', 'vitesse-light'],
            useStarlightUiThemeColors: true,
            styleOverrides: {
               borderRadius: '0.5rem',
               borderColor: 'var(--sl-color-hairline-light)',
            },
         },
         components: {
            Head: './src/components/Head.astro',
            PageTitle: './src/components/DocsPageTitle.astro',
         },
         head: [
            {
               tag: 'link',
               attrs: {
                  rel: 'icon',
                  href: '/favicon.svg',
                  type: 'image/svg+xml',
               },
            },
         ],
         sidebar: docsSidebar,
      }),
   ],
});
