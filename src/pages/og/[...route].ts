import { getCollection } from "astro:content";
import { OGImageRoute } from "astro-og-canvas";

import { formatDate } from "../../config";
import { ogImageOptions } from "../../lib/og";

const posts = await getCollection("posts", ({ data }) => !data.draft);

const pages = Object.fromEntries(
  posts.map((post) => [`posts/${post.id}`, post.data]),
);

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, post) =>
    ogImageOptions(
      post.title,
      `${formatDate(post.date)}  /  heredia.dev`,
    ),
});
