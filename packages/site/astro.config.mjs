// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
	site: 'https://aix.a1st.dev',
	integrations: [
		react(),
		starlight({
			title: 'aix',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/a1st-dev/aix' },
			],
			customCss: [
				'./src/styles/global.css',
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
					],
				},
				{
					label: 'Commands',
					items: [
						{ label: 'Overview', slug: 'commands/overview' },
						{ label: 'init', slug: 'commands/init' },
						{ label: 'add', slug: 'commands/add' },
						{ label: 'install', slug: 'commands/install' },
						{ label: 'search', slug: 'commands/search' },
						{ label: 'list', slug: 'commands/list' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ label: 'ai.json Format', slug: 'concepts/ai-json' },
						{ label: 'Supported Editors', slug: 'concepts/editors' },
						{ label: 'Skills & Rules', slug: 'concepts/skills' },
					],
				},
			],
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
