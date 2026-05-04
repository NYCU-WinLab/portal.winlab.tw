import { getOAuthMetadata } from "@/lib/auth/oauth-metadata"
import { getBaseUrl } from "@/lib/auth/urls"

export async function GET() {
  return Response.json(getOAuthMetadata(getBaseUrl()))
}
