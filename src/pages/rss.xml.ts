import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

import { SITE, postPath } from "../config";
import { renderFeedContent } from "../lib/rss";

const mdxPostIds = new Set(
  Object.keys(import.meta.glob("../content/posts/**/index.mdx")).map(
    (path) => path.match(/posts\/(.+)\/index\.mdx$/)?.[1] ?? "",
  ),
);

export async function GET(context: { site?: URL }) {
  const posts = (await getCollection("posts", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site ?? SITE.url,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      link: postPath(post.id),
      content: renderFeedContent(
        post.body ?? "",
        post.id,
        mdxPostIds.has(post.id),
      ),
    })),
  });
}
