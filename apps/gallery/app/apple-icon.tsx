import { ImageResponse } from "next/og"

import { GalleryPwaIcon } from "@/lib/gallery/pwa-icon"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(<GalleryPwaIcon size={180} />, {
    ...size,
  })
}
