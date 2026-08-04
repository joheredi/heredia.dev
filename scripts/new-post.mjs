#!/usr/bin/env node
/**
 * Scaffolds src/content/posts/<slug>/index.md from a title.
 *   npm run new "Some title"
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const title = process.argv.slice(2).join(" ").trim();
if (!title) {
  console.error('Usage: npm run new "Post title"');
  process.exit(1);
}

const slug = title
  .toLowerCase()
  .replace(/['’]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const dir = join("src", "content", "posts", slug);
const file = join(dir, "index.md");

try {
  await access(file);
  console.error(`Already exists: ${file}`);
  process.exit(1);
} catch {
  // expected: the post does not exist yet
}

const today = new Date().toISOString().slice(0, 10);
const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${today}
description: ""
tags: []
draft: true
---

`;

await mkdir(dir, { recursive: true });
await writeFile(file, frontmatter, "utf8");
console.log(`Created ${file}`);
console.log("Fill in `description` before publishing; it is required by the schema.");
