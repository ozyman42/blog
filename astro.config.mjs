// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { rendererRich, transformerTwoslash } from '@shikijs/twoslash';
import { defineConfig, fontProviders } from 'astro/config';
import { createHighlighter } from 'shiki';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toHast } from 'mdast-util-to-hast';
import remarkDirective from 'remark-directive';
import remarkCompare from './src/remark-compare.ts';

const docHighlighter = await createHighlighter({
	themes: ['github-dark'],
	langs: ['typescript', 'javascript'],
});

const langAliases = /** @type {Record<string, string>} */ ({
	ts: 'typescript', cts: 'typescript', mts: 'typescript',
	js: 'javascript', cjs: 'javascript', mjs: 'javascript',
});

/** @param {import('hast').ElementContent} node */
function highlightDocPre(node) {
	if (node.type !== 'element') return node;
	if (node.tagName === 'pre') {
		const code = node.children[0];
		if (code?.type === 'element' && code.tagName === 'code') {
			const rawLang = /** @type {string[]} */ (code.properties?.className ?? [])
				.find(c => c.startsWith('language-'))
				?.slice('language-'.length) ?? 'text';
			const lang = langAliases[rawLang] ?? rawLang;
			const text = code.children
				.filter(n => n.type === 'text')
				.map(n => /** @type {import('hast').Text} */ (n).value)
				.join('');
			try {
				return /** @type {import('hast').ElementContent} */ (
					docHighlighter.codeToHast(text, { lang, theme: 'github-dark' }).children[0]
				);
			} catch {
				return node;
			}
		}
	}
	node.children = node.children.map(highlightDocPre);
	return node;
}

/** @param {string} md */
function renderDocMarkdown(md) {
	const hast = toHast(fromMarkdown(md));
	if (!hast) return [];
	return hast.children.map(highlightDocPre);
}

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
						renderMarkdown: renderDocMarkdown,
						renderMarkdownInline(md) {
							const hast = toHast(fromMarkdown(md));
							if (!hast) return [];
							return hast.children.flatMap(node =>
								node.type === 'element' && node.tagName === 'p'
									? node.children.map(highlightDocPre)
									: [highlightDocPre(/** @type {import('hast').ElementContent} */ (node))]
							);
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
