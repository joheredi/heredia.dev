import type { APIRoute } from "astro";
import { generateOpenGraphImage } from "astro-og-canvas";

import { SITE } from "../../config";
import { ogImageOptions } from "../../lib/og";

export const GET: APIRoute = async () => {
  const image = await generateOpenGraphImage(
    ogImageOptions(SITE.title, SITE.description, 30),
  );

  return new Response(image, {
    headers: { "Content-Type": "image/png" },
  });
};
