import { randomUUID } from "node:crypto"
import { z } from "zod"

import { createClient } from "@/lib/supabase/client"

const oauthClientSchema = z.object({
  client_id: z.string(),
  client_name: z.string(),
  redirect_uris: z.array(z.string().url()).min(1),
  grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).min(1),
  response_types: z.array(z.literal("code")).min(1),
  created_at: z.string().optional(),
})

const registrationRequestSchema = z.object({
  client_name: z.string().min(1).default("MCP Client"),
  redirect_uris: z.array(z.string().url()).min(1),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .min(1)
    .default(["authorization_code", "refresh_token"]),
  response_types: z.array(z.literal("code")).min(1).default(["code"]),
})

export type OAuthClientRow = z.infer<typeof oauthClientSchema>

export type OAuthClientStore = {
  insert: (row: OAuthClientRow) => Promise<void>
  selectById: (clientId: string) => Promise<OAuthClientRow | null>
}

export async function registerOAuthClient(
  input: unknown,
  store = createDatabaseOAuthClientStore()
) {
  const registration = registrationRequestSchema.parse(input)
  const client = {
    client_id: randomUUID(),
    client_name: registration.client_name,
    redirect_uris: registration.redirect_uris,
    grant_types: registration.grant_types,
    response_types: registration.response_types,
    token_endpoint_auth_method: "none" as const,
  }

  await store.insert({
    ...client,
    created_at: new Date().toISOString(),
  })

  return client
}

export async function getOAuthClient(
  clientId: string,
  store = createDatabaseOAuthClientStore()
) {
  return store.selectById(clientId)
}

export async function getRedirectUriMatch(
  clientId: string,
  redirectUri: string,
  store = createDatabaseOAuthClientStore()
) {
  const client = await getOAuthClient(clientId, store)
  if (!client) return null
  return client.redirect_uris.includes(redirectUri) ? redirectUri : null
}

function createDatabaseOAuthClientStore(): OAuthClientStore {
  return {
    async insert(row) {
      const supabase = createClient()
      const { error } = await supabase.from("mcp_oauth_clients").insert({
        client_id: row.client_id,
        client_name: row.client_name,
        redirect_uris: row.redirect_uris,
        grant_types: row.grant_types,
        response_types: row.response_types,
      })
      if (error) {
        throw new Error(`Failed to store oauth client: ${error.message}`)
      }
    },
    async selectById(clientId) {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("mcp_oauth_clients")
        .select(
          "client_id, client_name, redirect_uris, grant_types, response_types, created_at"
        )
        .eq("client_id", clientId)
        .single()
      if (error || !data) return null
      return oauthClientSchema.parse(data)
    },
  }
}
