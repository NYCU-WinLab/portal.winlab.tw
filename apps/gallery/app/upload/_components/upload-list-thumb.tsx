"use client"

import { useState } from "react"

export function UploadListThumb({
  src,
  alt,
  isVideo = false,
}: {
  src: string
  alt: string
  isVideo?: boolean
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-dashed border-border bg-muted/40 p-1 text-center text-[10px] leading-tight text-muted-foreground">
        No preview
      </div>
    )
  }

  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden">
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      {isVideo ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/15"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-foreground">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      ) : null}
    </div>
  )
}
