import { getProtectedResourceMetadata } from "@/lib/auth/protected-resource-metadata"
import { getBaseUrl } from "@/lib/auth/urls"

export async function GET() {
  return Response.json(getProtectedResourceMetadata(getBaseUrl()))
}
