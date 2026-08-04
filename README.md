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

## Infrastructure

Things that live outside this repo, recorded here because they are invisible
from the code and easy to forget.

- **The custom domain is configured in the repo's Pages settings, not in a
  file.** Because the publishing source is GitHub Actions, GitHub ignores a
  `public/CNAME` file entirely; per GitHub's docs, "if you are publishing from
  a custom GitHub Actions workflow, no CNAME file is created, and any existing
  CNAME file is ignored and is not required." There is deliberately no CNAME
  file in this repo, so nothing looks authoritative while doing nothing. To
  change the domain, change it in Settings → Pages.
- **DNS is at Squarespace**, nameservers unchanged. Apex `heredia.dev` uses four
  `A` records (`185.199.108–111.153`) and four `AAAA` records
  (`2606:50c0:800{0,1,2,3}::153`); `www` is a `CNAME` to `joheredi.github.io`
  and 301s to the apex. Squarespace supports no ALIAS/ANAME/CNAME-flattening at
  the apex, which is precisely why GitHub Pages was chosen: it is the one host
  that does apex over plain A records.
- **TLS is automatic** via Let's Encrypt, with Enforce HTTPS on. `.dev` is
  HSTS-preloaded at the TLD level, so browsers upgrade to HTTPS before any
  connection is made and there is no plain-HTTP fallback. If the certificate
  ever lapses the site is hard-broken, not merely insecure.
- **Analytics is GoatCounter**, site code `heredia`, configured in
  `src/config.ts` and loaded only in production builds. Expect roughly a third
  of a technical audience to be invisible behind ad blockers; the numbers are
  directional, not accurate. Your own visits will not register if you run one.
- **`hello@heredia.dev` forwards** to a personal inbox using Squarespace's own
  built-in email forwarding, which routes through Mailgun and writes the `MX`
  and SPF records itself. No third-party forwarder, no nameserver change.
  **It is receive-only: there is no send-as.** Replies go out from the personal
  account and show that address, not `hello@heredia.dev`. If replying as the
  domain ever matters, it needs a real mailbox with SMTP (Purelymail and Migadu
  Micro are the cheap options, roughly $10–20/yr).
- **DMARC is at `p=none`** (monitoring only), in a record Squarespace/Mailgun
  manage, reporting to their addresses. Since this domain only receives mail,
  `p=reject` would be strictly more correct and would make it harder to spoof.
  It is deliberately left alone: overriding a managed record risks breaking
  forwarding, and the hardening mostly matters for domains that actually send.
  Revisit only if the domain gains a real mailbox.

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
