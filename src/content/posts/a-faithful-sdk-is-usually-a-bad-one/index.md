---
title: "A faithful SDK is usually a bad one"
date: 2026-08-04
description: "The hard part of generating a client library is not emitting syntax. It is deciding how far the generated API is allowed to drift from the specification it came from."
tags: ["typescript", "tooling", "architecture"]
draft: true
---

Every code generator starts from the same premise: there is a machine-readable
description of an API, and there should be a library that calls it. The premise is
sound. The trouble starts with an assumption that usually rides along unexamined,
which is that the library should be a faithful translation of the description.

It shouldn't. A specification and a client library have different audiences, and
optimizing for fidelity to the first reliably produces something unpleasant to use.

## The two audiences

A specification is written for a machine and read by the team that owns the service.
It is organized around the transport: resources, paths, status codes, wire shapes. It
is precise about things the service cares about, and vague about things it doesn't.

A client library is read by someone who has a problem that has nothing to do with your
transport. They want to upload a file, or list the things they own. They will encounter
your library through autocomplete, at 4pm, with a deadline.

These two documents disagree constantly, and the generator sits between them. Every
disagreement is a decision about whether to be faithful or to be useful.

## Naming is where it shows up first

Specifications name operations after the transport. A paginated list operation that
supports a continuation token often arrives with a name shaped by the mechanism rather
than the intent:

```ts
// Faithful to the spec
client.widgetsListByResourceGroupNext(nextLink, options);
```

Nobody wants to call that. What they want is:

```ts
// What the caller is actually trying to do
for await (const widget of client.widgets.list({ group })) {
  // ...
}
```

The second version is a lie, in a narrow sense. There is no `list` operation on the
wire that returns everything; there are two operations and a token-passing protocol.
The generator has invented an abstraction that does not exist in the specification.

That invention is the entire value of the library. A generator that refuses to make it
has produced a typed HTTP client, which the caller could have written themselves.

## Optionality is where it hurts most

This is the one that quietly ruins ergonomics, and it's worth being precise about why.

Specifications are often permissive about which fields are present. Sometimes that's
genuine: the field really is absent for some resources. More often it's defensive,
because marking a field required is a compatibility commitment and marking it optional
costs the service team nothing.

Translate that faithfully and every field becomes optional:

```ts
interface Widget {
  id?: string;
  name?: string;
  createdAt?: string;
  owner?: { id?: string; displayName?: string };
}
```

Now consider what the caller writes to print an owner's name:

```ts
const label = widget.owner?.displayName ?? "unknown"; // [!code highlight]
```

That looks harmless. It isn't. `id` is never actually absent, and the caller now cannot
tell which of these fields are genuinely optional and which are optional because someone
was hedging. The type system is loudest exactly where it has the least to say, and
callers respond the way people always respond to a type that cries wolf: a non-null
assertion, and a runtime error six months later.

The useful move is to distinguish the two cases, which means the generator needs
information the specification does not contain. That information has to come from
somewhere, usually an annotation on the spec or a per-API configuration file. There is
no clever inference that recovers it. If a generated library has good optionality, a
human decided it.

## Errors are the part everyone skips

Specifications describe the happy path in detail and error responses in a paragraph.
So generated error types tend to look like this:

```ts
class ApiError extends Error {
  statusCode: number;
  body: unknown; // [!code highlight]
}
```

`unknown` is honest and useless. The caller wants to know whether to retry, whether to
re-authenticate, or whether the request was malformed and will never succeed no matter
how many times they send it. That's three different behaviours and they cannot be
distinguished from a status code alone.

```ts
// Faithful: the caller reverse-engineers a taxonomy from status codes // [!code --]
if (err.statusCode === 429 || err.statusCode >= 500) retry();        // [!code --]
// Useful: the library commits to a taxonomy and documents it        // [!code ++]
if (err.isTransient) retry();                                        // [!code ++]
```

The second version requires the generator to make a judgment the spec did not make.
That judgment can be wrong. It is still better than making every caller guess
independently and inconsistently.

## When to be faithful

None of this argues for a generator that improvises freely. There are places where
fidelity is exactly right, and they have a pattern in common: **be faithful wherever
the caller may need to reason about the wire.**

| Concern | Be faithful | Why |
|---|---|---|
| Wire field names in serialized output | Yes | The caller may need to match logs or docs |
| Method and parameter names | No | Optimize for the call site |
| Status codes on the error object | Yes | Debuggable, greppable, matches the service's docs |
| Error taxonomy | No | The caller needs a decision, not a number |
| Pagination mechanics | No | Nobody wants to hold a continuation token |
| Escape hatch to raw requests | Always | The spec is always behind reality |

That last row deserves its own point.

## Always leave the escape hatch

A specification is a snapshot, and it is wrong the moment the service ships something
the spec author hasn't described yet. A preview header, an undocumented query
parameter, a field that appears in production before it appears in the schema.

If the generated library has no way to send a request it wasn't generated for, the
first person who hits that wall abandons the library entirely and writes raw HTTP for
everything. You lose the caller completely over one missing parameter.

> A generated client should be the easiest way to do the common thing and never the
> only way to do the uncommon one.

Concretely this means a documented path to send an arbitrary request through the same
pipeline: same auth, same retries, same telemetry. It gets used rarely, and the times
it gets used are the times the library would otherwise have been thrown away.

## The actual difficulty

Emitting syntactically correct code is a solved problem. Any competent template engine
or AST builder will do it, and arguing about which one is mostly arguing about taste.

The difficulty is that a generator encodes a set of opinions about what a good library
looks like, applied uniformly across an API surface nobody has read in full. When those
opinions are right, they're invisible: the library feels like someone wrote it by hand
and cared. When they're wrong, they're wrong identically in four hundred places, and
every caller works around them the same way.

That's the part worth spending time on. Not the emitter.
