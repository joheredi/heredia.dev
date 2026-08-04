---
title: "What Cache-Control actually promises"
date: 2026-07-21
description: "Cache-Control is a set of independent promises made to two different audiences, and most of the confusion comes from reading it as one setting."
tags: ["web", "performance", "networking"]
draft: false
---

<!--
Shiki notation reference for this site (matchAlgorithm: "v3"):
  - A notation in a comment that occupies the whole line applies to the NEXT line.
  - A notation in a trailing comment applies to the line it sits on.
  - Available here: [!code highlight], [!code ++], [!code --], [!code focus].
    Ranges work too: [!code highlight:3].
  - The comment token is whatever the language uses, so `# [!code ++]` in nginx
    or shell, `// [!code ++]` in JS.
-->

`Cache-Control` looks like one setting with a lot of possible values. It is not. It is a list of independent directives, some of which are addressed to the browser sitting on someone's laptop and some of which are addressed to a CDN edge node in another country. Reading it as a single knob is where most caching bugs start.

## Two caches, not one

Every response passes through at least two kinds of cache, and they have different trust levels:

- A **private cache** belongs to exactly one user. The browser's HTTP cache is the obvious one.
- A **shared cache** serves many users from the same stored response. CDNs, reverse proxies, and corporate egress proxies are all shared caches.

The directives split along that line:

| Directive | Applies to | Meaning |
| --- | --- | --- |
| `private` | shared caches | Do not store this at all |
| `public` | shared caches | Store this even if the request was authenticated |
| `max-age=N` | both | Fresh for N seconds |
| `s-maxage=N` | shared only | Overrides `max-age` for shared caches |
| `no-cache` | both | Store it, but revalidate before every reuse |
| `no-store` | both | Do not write it to disk or memory |

The one people get wrong is `no-cache`. It does not mean "do not cache". It means "cache this, but check with me before you serve it". The directive that means what people think `no-cache` means is `no-store`.

```http
HTTP/1.1 200 OK
Cache-Control: private, max-age=0, must-revalidate
ETag: "b1946ac9"
Content-Type: application/json
```

## Freshness is a deadline, not a guarantee

`max-age` is measured from the moment the response was generated at the origin, not the moment your browser received it. A response that sat in a CDN for 50 seconds arrives with `Age: 50`, and a `max-age=60` response is then fresh for 10 more seconds, not 60.

That is what the `Age` header is for, and it is why intermediate caches are required to add it. When you are debugging a cache, `Age` is the first thing to look at:

```bash
curl -sSI https://example.com/api/config \
  | grep -iE '^(age|cache-control|etag|vary):'
```

The lifecycle a cache runs for every request is short:

1. Find a stored response whose request key and `Vary` headers match.
2. Compute its current age and compare against `max-age` / `s-maxage`.
3. If fresh, serve it and stop. The origin never hears about the request.
4. If stale, revalidate with `If-None-Match` or `If-Modified-Since`.
5. On `304 Not Modified`, refresh the stored response's age and serve it.

Step 5 is the part worth internalising. A `304` is not a cache miss. It costs one round trip and zero bytes of body, and it resets the freshness clock.

### Revalidation is cheap; recomputation is not

If you can produce an `ETag` without doing the expensive work, revalidation is nearly free. If computing the `ETag` requires rendering the whole response anyway, you have saved bandwidth and nothing else. That tradeoff decides whether validators are worth adding to a given endpoint.

```js
const etag = `"${hashOf(record.updatedAt, record.version)}"`; // [!code highlight]

if (req.headers["if-none-match"] === etag) {
  res.writeHead(304, { ETag: etag, "Cache-Control": "max-age=0" });
  return res.end();
}
```

## Serving stale on purpose

`stale-while-revalidate` decouples "how long this is fresh" from "how long I would rather serve something slightly old than make the user wait". Inside the SWR window a cache serves the stale response immediately and refreshes it in the background.

```nginx
location /api/config {
  proxy_pass http://upstream;
  # [!code --]
  add_header Cache-Control "public, max-age=60";
  # [!code ++]
  add_header Cache-Control "public, max-age=60, stale-while-revalidate=600";
}
```

For anything read-mostly whose staleness costs nothing, that second line is close to free latency. The failure mode is real but narrow: a user can see up to `stale-while-revalidate` seconds of old data after an update, so it does not belong on anything the user just wrote.

`stale-if-error` is the sibling directive, and it is the one that earns its keep during an incident:

```js
// [!code focus:2]
const CACHE_HEADER =
  "public, max-age=60, stale-while-revalidate=600, stale-if-error=86400";

export function config(req, res) {
  res.setHeader("Cache-Control", CACHE_HEADER);
  res.setHeader("Vary", "Accept-Encoding");
  res.json(readConfig());
}
```

### Vary is where it breaks

A shared cache keys on the request URL plus whatever `Vary` lists. Get that wrong and you either poison the cache or destroy your hit rate.

> The "Vary" HTTP response header field describes what parts of the request message, aside from the method and target URI, might have influenced the origin server's process for selecting the content of this response.
>
> — [RFC 9111, section 4.1](https://www.rfc-editor.org/rfc/rfc9111#section-4.1)

Two rules cover most of it. `Vary: Accept-Encoding` is almost always correct and almost always necessary. `Vary: Cookie` is almost always a mistake: cookies are high-cardinality, so every distinct cookie value gets its own cache entry and the hit rate collapses toward zero. If a response genuinely depends on the user, mark it `private` and let the browser cache it, instead of asking a shared cache to do something it cannot do safely.

## A default worth starting from

- Immutable, content-hashed assets: `public, max-age=31536000, immutable`.
- HTML: `no-cache` plus a strong `ETag`, so a repeat navigation is a `304` rather than a full download.
- Read-mostly JSON: `public, max-age=60, stale-while-revalidate=600`.
- Anything user-specific: `private, no-store`, and stop thinking about it.

Pick from that list first, and reach for something more elaborate only when you can name the request that made it necessary.
