import type { MetadataRoute } from "next"

/** Static axolotl marks — prefer public/icons for PWA (cacheable, no ImageResponse). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gallery — WinLab",
    short_name: "Gallery",
    description: "Lab polaroids on a darkroom paper wall — NYCU WinLab.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f4f5",
    theme_color: "#f4f4f5",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  }
}
