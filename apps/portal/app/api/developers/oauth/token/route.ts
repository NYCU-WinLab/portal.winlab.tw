import { tokenResponse, preflight } from "@/lib/developers/http"
import { createOAuthStore } from "@/lib/developers/store"
export const runtime = "nodejs"
export async function POST(request: Request) {
  return tokenResponse(request, createOAuthStore())
}
export const OPTIONS = preflight
