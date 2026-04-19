import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const postSchema = ({ image }: { image: () => z.ZodType }) =>
	z.object({
		title: z.string(),
		description: z.string(),
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.optional(image()),
	});

const tech = defineCollection({
	loader: glob({ base: './src/content/tech', pattern: '**/*.{md,mdx}' }),
	schema: postSchema,
});

const depth = defineCollection({
	loader: glob({ base: './src/content/depth', pattern: '**/*.{md,mdx}' }),
	schema: postSchema,
});

export const collections = { tech, depth };
