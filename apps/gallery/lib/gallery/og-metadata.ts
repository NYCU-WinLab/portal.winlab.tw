import type { Metadata } from "next"

import { getGalleryThumbUrl } from "@/lib/gallery/url"

type GalleryOgRow = {
  name: string
  image_path: string
  media_type: string | null
  poster_path: string | null
}

export function resolveGallerySiteOrigin(host: string | null): string {
  if (host?.includes("localhost") || host?.startsWith("127.0.0.1")) {
    return `http://${host}`
  }
  if (host) return `https://${host}`
  return "https://gallery.winlab.tw"
}

export function buildGalleryPhotoMetadata(
  row: GalleryOgRow,
  origin: string,
  photoId: string
): Metadata {
  const thumbPath =
    row.media_type === "video" && row.poster_path
      ? row.poster_path
      : row.image_path
  const imageUrl = getGalleryThumbUrl(thumbPath, 1200)
  const pageUrl = `${origin}/?photo=${encodeURIComponent(photoId)}`
  const title = `${row.name} — Gallery`
  const description = "Art from NYCU WinLab."

  return {
    title,
    description,
    openGraph: {
      type: "website",
      url: pageUrl,
      title: row.name,
      description,
      images: [{ url: imageUrl, width: 1200, alt: row.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: row.name,
      description,
      images: [imageUrl],
    },
  }
}

export const DEFAULT_GALLERY_METADATA: Metadata = {
  title: "Gallery — WinLab",
  description: "Art from NYCU WinLab.",
  openGraph: {
    title: "Gallery — WinLab",
    description: "Art from NYCU WinLab.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gallery — WinLab",
    description: "Art from NYCU WinLab.",
  },
}
