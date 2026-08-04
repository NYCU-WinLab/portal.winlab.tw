// Deterministic polaroid crop per image — stable across SSR/CSR.
export type PolaroidFrame = {
  aspectClass: string
  maxWidthClass: string
}

/** Washi-tape / clip accent on the polaroid corner. */
export type PolaroidTape = "tl" | "tr" | "clip" | "none"

const FRAMES: PolaroidFrame[] = [
  { aspectClass: "aspect-[4/5]", maxWidthClass: "max-w-[16rem]" },
  { aspectClass: "aspect-[3/4]", maxWidthClass: "max-w-[15rem]" },
  { aspectClass: "aspect-square", maxWidthClass: "max-w-[14rem]" },
  { aspectClass: "aspect-[5/4]", maxWidthClass: "max-w-[18rem]" },
  { aspectClass: "aspect-[4/3]", maxWidthClass: "max-w-[21rem]" },
  { aspectClass: "aspect-[3/2]", maxWidthClass: "max-w-[22rem]" },
]

function frameSeed(id: string): number {
  const slice = parseInt(id.replace(/-/g, "").slice(8, 16), 16)
  if (Number.isFinite(slice)) return slice
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function getPolaroidFrame(id: string): PolaroidFrame {
  const idx = frameSeed(id) % FRAMES.length
  return FRAMES[idx]!
}

export function getPolaroidTape(id: string): PolaroidTape {
  // ~70% of cards get tape or a clip — the wall should look hung, not sparse.
  const slot = frameSeed(id) % 10
  if (slot <= 2) return "tl"
  if (slot <= 5) return "tr"
  if (slot <= 6) return "clip"
  return "none"
}
