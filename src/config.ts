/**
 * Single source of truth for site-wide values. Imported by layouts, the RSS
 * endpoint, and the OG card generator so they cannot drift apart.
 */
export const SITE = {
  title: "heredia.dev",
  /** Used in the RSS feed and as the meta description fallback. */
  description: "Notes on software, systems, and the occasional interactive explanation.",
  author: "Jose Manuel Heredia Hidalgo",
  url: "https://heredia.dev",
  /** Owner/repo, used to build the per-post "suggest an edit" link. */
  repo: "joheredi/heredia.dev",
  email: "hello@heredia.dev",
  github: "https://github.com/joheredi",
  /** GoatCounter site code; the analytics script is omitted when this is null. */
  goatcounter: "heredia",
  locale: "en",
} as const;

/** Canonical path for a post, given its collection id. */
export const postPath = (id: string) => `/posts/${id}/`;

/** Build-time generated Open Graph card for a post. */
export const ogPath = (id: string) => `/og/posts/${id}.png`;

/** GitHub edit URL for a post's source file. */
export const editUrl = (id: string, ext: "md" | "mdx" = "md") =>
  `https://github.com/${SITE.repo}/edit/main/src/content/posts/${id}/index.${ext}`;

export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
