import type { OGImageOptions } from "astro-og-canvas";

const fonts = [
  "./node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2",
  "./node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
];

export const ogImageOptions = (
  title: string,
  description: string,
  descriptionSize = 22,
): OGImageOptions => ({
  title,
  description,
  bgGradient: [[20, 22, 24]],
  border: {
    color: [126, 154, 133],
    width: 14,
    side: "inline-start",
  },
  padding: 80,
  fonts,
  font: {
    title: {
      color: [239, 237, 231],
      families: ["Source Serif 4"],
      size: title.length > 150 ? 44 : title.length > 105 ? 52 : title.length > 70 ? 60 : 70,
      lineHeight: 1.08,
      weight: "Normal",
    },
    description: {
      color: [172, 184, 176],
      families: ["JetBrains Mono"],
      size: descriptionSize,
      lineHeight: 1.2,
      weight: "Normal",
    },
  },
});
