import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import icon from "astro-icon";
import astroLlmsTxt from "@4hse/astro-llms-txt";

export default defineConfig({
  site: "https://aix.a1st.dev",
  integrations: [
    icon(),
    astroLlmsTxt({
      title: "aix",
      description: "One config file for every AI editor. Define skills, rules, prompts, and MCP servers in ai.json.",
      docSet: [
        {
          title: "Complete documentation",
          description: "Full aix documentation with all guides and references",
          url: "/llms-full.txt",
          include: ["**"],
        },
      ],
    }),
    starlight({
      title: "aix",
      description:
        "One config file. Every AI editor. Define skills, rules, prompts, and MCP servers in ai.json — install to Cursor, VS Code, Claude Code, Windsurf, Zed, and Codex.",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/a1st-dev/aix",
        },
      ],
      customCss: [
        "@fontsource/cormorant-garamond/400.css",
        "@fontsource/cormorant-garamond/500.css",
        "@fontsource/cormorant-garamond/600.css",
        "@fontsource/cormorant-garamond/700.css",
        "@fontsource/instrument-sans/400.css",
        "@fontsource/instrument-sans/500.css",
        "@fontsource/instrument-sans/600.css",
        "@fontsource/instrument-sans/700.css",
        "./src/styles/theme.css",
      ],
      components: {
        Head: './src/components/Head.astro',
      },
      head: [
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: "/favicon.svg",
            type: "image/svg+xml",
          },
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: "Configuration",
          autogenerate: { directory: 'configuration' },
        },
        {
          label: "Concepts",
          autogenerate: { directory: 'concepts' },
        },
        {
          label: "CLI Reference",
          autogenerate: { directory: 'cli' },
        },
        {
          label: "Editors",
          autogenerate: { directory: 'editors' },
        },
      ],
    }),
  ],
});
