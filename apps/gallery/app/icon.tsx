import { ImageResponse } from "next/og"

import { GalleryPwaIcon } from "@/lib/gallery/pwa-icon"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(<GalleryPwaIcon size={32} />, {
    ...size,
  })
}
