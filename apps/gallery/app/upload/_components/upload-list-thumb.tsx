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
      <div className="flex h-[5.25rem] w-[4.5rem] shrink-0 items-center justify-center border-[3px] border-[#f7f7f5] bg-[#f7f7f5] p-1 text-center text-[10px] leading-tight text-muted-foreground shadow-[0_6px_16px_-8px_rgba(24,24,27,0.35)]">
        No preview
      </div>
    )
  }

  return (
    <div className="relative h-[5.25rem] w-[4.5rem] shrink-0 overflow-hidden rounded-[1px] border-[3px] border-[#f7f7f5] bg-[#f7f7f5] shadow-[0_6px_18px_-8px_rgba(24,24,27,0.38),0_0_0_1px_rgba(24,24,27,0.06)]">
      <img
        src={src}
        alt={alt}
        className="h-[calc(100%-0.7rem)] w-full object-cover"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      {isVideo ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 flex h-[calc(100%-0.7rem)] items-center justify-center bg-black/15"
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
