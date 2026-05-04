"use client"

import { useState } from "react"

export function UploadListThumb({ src, alt }: { src: string; alt: string }) {
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
    </div>
  )
}
