import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

import { SITE, postPath } from "../config";

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

const absoluteUrl = (value: string, base: URL) => {
  try {
    const url = new URL(value, base);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol)
      ? url.href
      : value;
  } catch {
    return value;
  }
};

const absoluteSrcset = (value: string, base: URL) =>
  value
    .split(",")
    .map((candidate) => {
      const [url, ...descriptor] = candidate.trim().split(/\s+/);
      return [absoluteUrl(url, base), ...descriptor].join(" ");
    })
    .join(", ");

const makeUrlsAbsolute = (html: string, postId: string) => {
  const base = new URL(postPath(postId), SITE.url);

  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "srcset", "alt", "title", "width", "height", "loading"],
    },
    transformTags: {
      a: (tagName, attributes) => ({
        tagName,
        attribs: {
          ...attributes,
          ...(attributes.href
            ? { href: absoluteUrl(attributes.href, base) }
            : {}),
        },
      }),
      img: (tagName, attributes) => ({
        tagName,
        attribs: {
          ...attributes,
          ...(attributes.src
            ? { src: absoluteUrl(attributes.src, base) }
            : {}),
          ...(attributes.srcset
            ? { srcset: absoluteSrcset(attributes.srcset, base) }
            : {}),
        },
      }),
    },
  });
};

const importIsComplete = (line: string, depth: number) =>
  depth <= 0 &&
  (line.includes(";") ||
    /(?:from\s+)?["'][^"']+["']\s*$/.test(line.trim()));

const stripImports = (source: string) => {
  const output: string[] = [];
  let inImport = false;
  let depth = 0;

  for (const line of source.split(/\r?\n/)) {
    if (!inImport && /^\s*import(?:\s|\{|\*|["'])/.test(line)) {
      inImport = true;
      depth = 0;
    }

    if (inImport) {
      depth += (line.match(/[\{\(\[]/g) ?? []).length;
      depth -= (line.match(/[\}\)\]]/g) ?? []).length;
      if (importIsComplete(line, depth)) inImport = false;
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
};

const stripComponentTags = (source: string) => {
  let output = "";

  for (let index = 0; index < source.length; index++) {
    if (source[index] !== "<") {
      output += source[index];
      continue;
    }

    let cursor = index + 1;
    if (source[cursor] === "/") cursor++;
    const isFragment = source[cursor] === ">";
    if (!isFragment && !/[A-Z]/.test(source[cursor] ?? "")) {
      output += source[index];
      continue;
    }
    if (isFragment) {
      index = cursor;
      continue;
    }

    let quote = "";
    let braceDepth = 0;
    while (++cursor < source.length) {
      const character = source[cursor];
      if (quote) {
        if (character === quote && source[cursor - 1] !== "\\") quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "{") {
        braceDepth++;
      } else if (character === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
      } else if (character === ">" && braceDepth === 0) {
        index = cursor;
        break;
      }
    }
  }

  return output;
};

export const neutralizeMdx = (source: string) => {
  const output: string[] = [];
  let prose: string[] = [];
  let fence = "";

  const flushProse = () => {
    if (!prose.length) return;
    output.push(stripComponentTags(stripImports(prose.join("\n"))));
    prose = [];
  };

  for (const line of source.split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1] ?? "";
    if (!fence && marker) {
      flushProse();
      fence = marker[0];
      output.push(line);
    } else if (fence && marker.startsWith(fence)) {
      output.push(line);
      fence = "";
    } else if (fence) {
      output.push(line);
    } else {
      prose.push(line);
    }
  }
  flushProse();

  return output.join("\n");
};

export const renderFeedContent = (
  body: string,
  postId: string,
  isMdx: boolean,
) => {
  const source = isMdx ? neutralizeMdx(body) : body;
  const content = makeUrlsAbsolute(markdown.render(source), postId);

  if (!isMdx) return content;

  const url = new URL(postPath(postId), SITE.url).href;
  return `${content}<p><em>This post contains an interactive diagram. <a href="${url}">Read it on heredia.dev.</a></em></p>`;
};
