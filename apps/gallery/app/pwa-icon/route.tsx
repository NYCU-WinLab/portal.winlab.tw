import { ImageResponse } from "next/og"

import { GalleryPwaIcon } from "@/lib/gallery/pwa-icon"

export const runtime = "edge"

const ALLOWED_SIZES = new Set([192, 512])

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsed = Number.parseInt(searchParams.get("size") ?? "512", 10)
  const size = ALLOWED_SIZES.has(parsed) ? parsed : 512

  return new ImageResponse(<GalleryPwaIcon size={size} />, {
    width: size,
    height: size,
  })
}
