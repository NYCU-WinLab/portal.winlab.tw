import type { NextRequest } from "next/server"

export const GALLERY_API_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8",
} as const

export function isGalleryApiAuthorized(request: NextRequest): boolean {
  const secret = process.env.GALLERY_API_SECRET
  if (!secret) return false
  const auth = request.headers.get("Authorization") ?? ""
  return auth === `Bearer ${secret}`
}
