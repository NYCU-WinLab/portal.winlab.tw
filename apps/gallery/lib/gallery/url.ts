// Build a public Supabase Storage URL for a gallery image. Bucket is public,
// so we can construct the URL directly without an API round-trip.
export function getGalleryImageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")
  return `${base}/storage/v1/object/public/gallery/${encodeStoragePath(path)}`
}

/** Resized grid thumb via Supabase Storage image transforms. */
export function getGalleryThumbUrl(path: string, width = 480): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")
  const params = new URLSearchParams({
    width: String(width),
    height: String(Math.round(width * 1.25)),
    resize: "cover",
    quality: "80",
  })
  return `${base}/storage/v1/render/image/public/gallery/${encodeStoragePath(path)}?${params}`
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}
