import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';

export default function remarkCompare() {
	return (tree: Root) => {
		visit(tree, (node: any) => {
			if (node.type !== 'containerDirective' || node.name !== 'compare') return;

			const codeBlocks = node.children.filter((c: any) => c.type === 'code');
			if (codeBlocks.length < 2) return;

			node.data = { hName: 'div', hProperties: { class: 'compare-blocks' } };
			node.children = [
				makePanel('Before', 'compare-before', codeBlocks[0]),
				makePanel('After', 'compare-after', codeBlocks[1]),
			];
		});
	};
}

function makePanel(label: string, cls: string, codeNode: any) {
	return {
		type: 'containerDirective',
		name: cls,
		data: { hName: 'div', hProperties: { class: cls } },
		attributes: {},
		children: [
			{
				type: 'paragraph',
				children: [{ type: 'text', value: label }],
				data: { hProperties: { class: 'compare-label' } },
			},
			codeNode,
		],
	};
}
