"use server"

import OAuth2Server from "@node-oauth/oauth2-server"
import { redirect } from "next/navigation"
import {
  authorizationDetails,
  developerSession,
} from "@/lib/developers/queries"
import { createAdminClient } from "@/lib/supabase/admin"
import { createOAuthServer } from "@/lib/developers/oauth"
import { createOAuthStore, databaseError } from "@/lib/developers/store"
import type { AuthorizationInput } from "@/lib/developers/policy"

export async function decideAuthorization(
  input: AuthorizationInput,
  form: FormData
) {
  const { user } = await developerSession()
  const details = await authorizationDetails(input)
  const target = new URL(details.input.redirect_uri)
  target.searchParams.set("state", details.input.state)
  if (form.get("decision") !== "approve") {
    target.searchParams.set("error", "access_denied")
    redirect(target.toString())
  }
  const db = createAdminClient()
  const { data: grant, error } = await db
    .from("developer_grants")
    .insert({
      app_id: details.app.id,
      user_id: user.id,
      scopes: details.scopes,
    })
    .select("id")
    .single()
  databaseError(error)
  try {
    const code = await createOAuthServer(
      createOAuthStore(),
      "authorize"
    ).authorize(
      new OAuth2Server.Request({
        method: "GET",
        headers: {},
        query: details.input,
      }),
      new OAuth2Server.Response(),
      {
        authenticateHandler: {
          handle: () => ({ id: user.id, grantId: grant!.id }),
        },
      }
    )
    target.searchParams.set("code", code.authorizationCode)
  } catch {
    await db
      .from("developer_grants")
      .delete()
      .eq("id", grant!.id)
      .eq("user_id", user.id)
    target.searchParams.set("error", "temporarily_unavailable")
  }
  redirect(target.toString())
}
