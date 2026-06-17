// Deterministic polaroid crop per image — stable across SSR/CSR.
export type PolaroidFrame = {
  aspectClass: string
  maxWidthClass: string
}

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
