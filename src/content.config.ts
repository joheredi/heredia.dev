import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "zod";

/**
 * Fixed vocabulary. Adding a tag is a deliberate edit here, which is what stops
 * `typescript` / `TypeScript` / `ts` becoming three tags.
 */
export const TAGS = [
  "typescript",
  "javascript",
  "rust",
  "web",
  "performance",
  "tooling",
  "architecture",
  "networking",
  "algorithms",
  "testing",
] as const;

export type Tag = (typeof TAGS)[number];

const posts = defineCollection({
  loader: glob({
    base: "./src/content/posts",
    pattern: "**/index.{md,mdx}",
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      description: z.string(),
      tags: z.array(z.enum(TAGS)).default([]),
      draft: z.boolean().default(false),
      cover: image().optional(),
      /** Set true only on posts discussing Microsoft products or services. */
      disclose: z.boolean().default(false),
    }),
});

export const collections = { posts };
