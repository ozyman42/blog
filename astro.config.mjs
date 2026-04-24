// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { rendererRich, transformerTwoslash } from '@shikijs/twoslash';
import { defineConfig, fontProviders } from 'astro/config';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toHast } from 'mdast-util-to-hast';
import remarkDirective from 'remark-directive';
import remarkCompare from './src/remark-compare.ts';

// https://astro.build/config
export default defineConfig({
	site: 'https://ozyman42.github.io',
	integrations: [mdx(), sitemap()],
	markdown: {
		remarkPlugins: [remarkDirective, remarkCompare],
		shikiConfig: {
			theme: 'github-dark',
			wrap: true,
			transformers: [
				transformerTwoslash({
					explicitTrigger: true,
					renderer: rendererRich({
						renderMarkdown(md) {
							const hast = toHast(fromMarkdown(md));
							return hast?.children ?? [];
						},
					}),
				}),
			],
		},
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
