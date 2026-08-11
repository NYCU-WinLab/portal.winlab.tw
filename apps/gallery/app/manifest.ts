import type { MetadataRoute } from "next"

/** Static axolotl marks — prefer public/icons for PWA (cacheable, no ImageResponse). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // Stable install identity so an update never spawns a duplicate app.
    id: "/",
    name: "Gallery — WinLab",
    short_name: "Gallery",
    description: "Lab polaroids on a cool slate paper wall — NYCU WinLab.",
    lang: "en",
    dir: "ltr",
    categories: ["photo", "social"],
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#e4e4e7",
    theme_color: "#e4e4e7",
    shortcuts: [
      {
        name: "Hang a photo",
        short_name: "Upload",
        description: "Add a new polaroid to the wall",
        url: "/upload",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
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
