// Adapted from @4hse/astro-llms-txt (MIT), which adapts the HTML to Markdown conversion in
// starlight-llms-txt (MIT, Copyright (c) 2025-present, delucis). That package does not
// support Astro 7, and starlight-llms-txt reads only the docs collection, which leaves out
// the editor pages in src/pages.
import { readFile, writeFile } from 'node:fs/promises';
import type { AstroIntegration } from 'astro';
import type { Element, Root } from 'hast';
import { matches, select, selectAll } from 'hast-util-select';
import { toString } from 'hast-util-to-string';
import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import type { Node } from 'unist';
import { remove } from 'unist-util-remove';

export interface LlmsTxtOptions {
   title: string;
   description: string;
   fullText: {
      title: string;
      description: string;
      /** Receives a page path without a leading slash, such as `cli/add/` */
      isIncluded: (pathname: string) => boolean;
   };
}

const FULL_TEXT_FILE = 'llms-full.txt',
      PAGE_SEPARATOR = '\n\n---\n\n',
      IGNORED_SELECTORS = [ 'h1', 'footer', 'header' ],
      htmlParser = unified().use(rehypeParse);

function isElement(node: Node): node is Element {
   return node.type === 'element';
}

function removeIgnoredElements(): (tree: Root) => void {
   return (tree) => {
      remove(tree, (node: Node) => {
         return isElement(node) && IGNORED_SELECTORS.some((selector) => {
            return matches(selector, node);
         });
      });
   };
}

// Expressive Code stores the language on <pre data-language>, and hast-util-to-mdast reads
// it from a language-* class on <code>. The terminal frame label is screen reader text.
function convertExpressiveCode(): (tree: Root) => void {
   return (tree) => {
      for (const frame of selectAll('.expressive-code', tree)) {
         const figcaption = select('figcaption', frame),
               pre = select('pre', frame),
               code = select('code', frame),
               language = pre?.properties.dataLanguage;

         if (figcaption) {
            figcaption.children = figcaption.children.filter((child) => {
               return !matches('span.sr-only', child);
            });
         }

         if (code && typeof language === 'string') {
            const classNames = Array.isArray(code.properties.className) ? code.properties.className : [];

            code.properties.className = [ ...classNames, `language-${language}` ];
         }
      }
   };
}

const markdownConverter = unified()
   .use(removeIgnoredElements)
   .use(convertExpressiveCode)
   .use(rehypeRemark)
   .use(remarkGfm)
   .use(remarkStringify);

async function convertPage(htmlPath: URL): Promise<string> {
   const tree = htmlParser.parse(await readFile(htmlPath, 'utf-8')),
         main = select('main', tree);

   if (!main) {
      throw new Error(`${htmlPath.pathname} has no <main> element`);
   }

   const h1 = select('h1', main),
         title = h1 ? toString(h1).trim() : 'Untitled',
         description = select('meta[name="description"]', tree)?.properties.content,
         markdownTree = await markdownConverter.run({ type: 'root', children: main.children }),
         markdown = markdownConverter.stringify(markdownTree).trim(),
         parts = [ `# ${title}` ];

   if (typeof description === 'string' && description.trim()) {
      parts.push(`> ${description.trim()}`);
   }

   parts.push(markdown);

   return parts.join('\n\n');
}

function buildIndex(options: LlmsTxtOptions, site: string | undefined): string {
   const fullTextURL = new URL(FULL_TEXT_FILE, site),
         fullTextLink = `- [${options.fullText.title}](${fullTextURL.href}): ${options.fullText.description}`;

   return [
      `# ${options.title}`,
      `> ${options.description}`,
      `## Documentation Sets\n\n${fullTextLink}`,
   ].join('\n\n');
}

export function llmsTxt(options: LlmsTxtOptions): AstroIntegration {
   let site: string | undefined;

   return {
      name: 'aix-llms-txt',
      hooks: {
         'astro:config:setup': ({ config }) => {
            site = config.site;
         },
         'astro:build:done': async ({ dir, pages, logger }) => {
            const collator = new Intl.Collator('en'),
                  pathnames = pages.map((page) => {
                     return page.pathname;
                  }).filter(options.fullText.isIncluded).toSorted(collator.compare);

            const entries = await Promise.all(pathnames.map((pathname) => {
               return convertPage(new URL(`${pathname.replace(/\/?$/, '/')}index.html`, dir));
            }));

            await writeFile(
               new URL(FULL_TEXT_FILE, dir),
               `<SYSTEM>${options.fullText.description}</SYSTEM>\n\n${entries.join(PAGE_SEPARATOR)}`,
               'utf-8',
            );
            await writeFile(new URL('llms.txt', dir), buildIndex(options, site), 'utf-8');

            logger.info(`Wrote llms.txt and ${FULL_TEXT_FILE} with ${entries.length} pages`);
         },
      },
   };
}
