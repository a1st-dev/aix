import { getCollection } from 'astro:content';
import { OGImageRoute } from 'astro-og-canvas';

const docs = await getCollection('docs');

const pages: Record<string, { title: string; description?: string }> = Object.fromEntries(
   docs.map((entry) => [entry.data.slug ?? entry.id, { title: entry.data.title, description: entry.data.description }]),
);

// Landing page
pages['index'] = {
   title: 'aix',
   description: 'One config file. Every AI editor.',
};

export const { getStaticPaths, GET } = await OGImageRoute({
   param: 'route',
   pages,
   getImageOptions: (_path, page) => ({
      title: page.title,
      description: page.description,
      bgGradient: [[14, 12, 10]],
      border: {
         color: [212, 168, 83],
         width: 20,
         side: 'inline-start',
      },
      padding: 80,
      font: {
         title: {
            color: [245, 240, 232],
            size: 72,
            families: ['Cormorant Garamond'],
            weight: 'SemiBold',
         },
         description: {
            color: [200, 190, 175],
            size: 36,
            families: ['Instrument Sans'],
         },
      },
      fonts: [
         '../../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2',
         '../../node_modules/@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff2',
      ],
   }),
});
