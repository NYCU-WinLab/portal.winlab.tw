// Deterministic tilt per image — same id, same angle. Stable across SSR/CSR
// so React doesn't scream about hydration mismatch.
//
// We hash the id into a number, then map to [-MAX_DEG, +MAX_DEG]. UUID first
// 8 hex chars is plenty of entropy for a tilt.
const MAX_DEG = 5

export function getRotation(id: string): number {
  // Pull a stable 32-bit-ish int out of the id. UUID prefix works; for any
  // other id shape we still get a predictable hash via char codes.
  const seed = parseInt(id.replace(/-/g, "").slice(0, 8), 16)
  const safe = Number.isFinite(seed) ? seed : fallbackHash(id)
  // Map to roughly [-MAX_DEG, +MAX_DEG] with two decimal places of variation.
  const normalized = (safe % 1000) / 1000 // 0..0.999
  const signed = normalized * 2 - 1 // -1..0.999
  return Number((signed * MAX_DEG).toFixed(2))
}

function fallbackHash(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
