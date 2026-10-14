import { revokeResponse, preflight } from "@/lib/developers/http"
import { createOAuthStore, databaseError } from "@/lib/developers/store"
import { createAdminClient } from "@/lib/supabase/admin"
export const runtime = "nodejs"
export async function POST(request: Request) {
  return revokeResponse(request, createOAuthStore(), async (id) => {
    const { error } = await createAdminClient()
      .from("developer_grants")
      .delete()
      .eq("id", id)
    databaseError(error)
  })
}
export const OPTIONS = preflight
