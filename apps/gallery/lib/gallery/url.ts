// Build a public Supabase Storage URL for a gallery image. Bucket is public,
// so we can construct the URL directly without an API round-trip.
export function getGalleryImageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")
  return `${base}/storage/v1/object/public/gallery/${path}`
}
