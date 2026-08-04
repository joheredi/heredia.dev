# heredia.dev

Source for my personal technical blog. Astro static site, built to `dist/`,
deployed to GitHub Pages at the apex domain `heredia.dev`.

## Publishing a post

1. `npm run new "Some title"` — scaffolds `src/content/posts/<slug>/index.md`
   with frontmatter and `draft: true`.
2. Write the post. `description` is required by the content schema — the build
   fails without it, so fill it in.
3. `npm run dev` and preview at the local URL.
4. Set `draft: false` when it's ready.
5. Commit and push to `main`. The Deploy workflow builds, link-checks, and
   publishes.

Posts are **folders**, not single files: `src/content/posts/<slug>/index.md`,
with images colocated in the same folder and referenced relatively
(`![alt](./diagram.png)`). The `<slug>` folder name is the permanent URL.

To make a post interactive, rename its `index.md` to `index.mdx` and import a
Svelte component. Keep it hydration-light: mount demos with `client:visible` so
they only load when scrolled into view.

## Frontmatter

Defined and validated in `src/content.config.ts`.

- `title` — post title (string, required).
- `date` — original publish date (required).
- `updated` — date of a substantive revision (optional; see corrections below).
- `description` — one-line summary, used for `<meta>` and cards (required).
- `tags` — array from a **fixed vocabulary** in `src/content.config.ts`. Adding
  a tag is a deliberate edit to that list; unknown tags fail the build. This is
  what stops `ts` / `typescript` / `TypeScript` becoming three tags.
- `draft` — `true` hides the post from the built site. Defaults to `false`.
- `cover` — optional cover image (colocated in the post folder).
- `disclose` — set `true` only on posts discussing Microsoft products or
  services. Defaults to `false`.

## Corrections policy

- Typos and formatting: fixed silently, no `updated` date.
- Changing a claim, correcting a fact, or reversing a recommendation: set the
  `updated` date **and** add a visible dated note in the post body. The reader
  should see that something changed and what.

## Local development

- `npm run dev` — dev server with hot reload.
- `npm run build` — production build to `dist/`.
- `npm run preview` — serve the built `dist/` locally.
- `npm run new "Title"` — scaffold a new post folder.
- `npm run check` — `astro check` (type/content diagnostics).

## Workflows

- **Deploy** (`deploy.yml`) — on push to `main`. Builds, runs a blocking
  **internal** link check (offline, so zero flakiness) that fails the deploy on
  a broken link to one of the site's own pages, then publishes to GitHub Pages.
- **Canary** (`canary.yml`) — monthly. Builds from scratch and does **not**
  deploy. It exists to catch the day a dependency (usually Astro or Vite, which
  ship breaking majors a few times a year) stops the site building — turning a
  publish-time surprise into an email on a quiet day. On failure it opens/updates
  a single tracking issue. Don't delete it as "redundant with Deploy": Deploy
  only runs when you push, and this covers the months you don't.
- **Links** (`links.yml`) — weekly. Checks **external** links and files/updates
  an issue with the report instead of failing. External checks are flaky by
  nature (rate limits, transient outages), and a flaky blocking check just
  teaches you to ignore CI. Uses lychee's on-disk cache so it doesn't re-hammer
  the same URLs weekly.

Dependencies: Dependabot (`dependabot.yml`) is npm security-updates-only
(static HTML has no server runtime to attack, so routine bumps are noise) plus
monthly grouped GitHub Actions updates.

## Design decisions

Load-bearing choices, recorded so they aren't accidentally undone:

- **No theme toggle.** Deliberate. A toggle needs a blocking inline
  `localStorage` script in `<head>` to avoid a flash of the wrong theme; that
  script is exactly the kind of render-blocking JS this site avoids. The site
  follows the OS `prefers-color-scheme` instead.
- **`/posts/<slug>/` URLs are permanent.** The slug is the folder name and the
  public contract. Renaming a slug breaks inbound links and is treated as a
  breaking change, not a tidy-up.
- **Tags are a fixed enum.** Enforced by the schema to prevent tag rot and
  near-duplicate tags.
- **Near-zero client JS by default.** Pages ship no framework runtime unless a
  post opts in; interactive demos hydrate per-post via `client:visible`.
- **Analytics are directional only.** GoatCounter numbers undercount because ad
  blockers hide roughly a third of a technical audience. Read trends, not
  absolutes.
