import { z } from "zod"

import { getOAuthClient, type OAuthClientStore } from "@/lib/auth/oauth-clients"

const authorizeRequestSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  response_type: z.literal("code"),
  code_challenge: z.string().min(1),
  code_challenge_method: z.literal("S256"),
  resource: z.string().url().optional(),
  state: z.string().optional(),
})

const tokenAuthorizationCodeSchema = z.object({
  code: z.string().min(1),
  code_verifier: z.string().min(1),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  resource: z.string().url().optional(),
})

export function parseAuthorizeRequest(searchParams: URLSearchParams) {
  const parsed = authorizeRequestSchema.parse(Object.fromEntries(searchParams))
  return {
    clientId: parsed.client_id,
    redirectUri: parsed.redirect_uri,
    responseType: parsed.response_type,
    codeChallenge: parsed.code_challenge,
    codeChallengeMethod: parsed.code_challenge_method,
    resource: parsed.resource,
    state: parsed.state,
  }
}

export function parseTokenAuthorizationCodeRequest(formData: FormData) {
  const parsed = tokenAuthorizationCodeSchema.parse({
    code: getStringField(formData, "code"),
    code_verifier: getStringField(formData, "code_verifier"),
    client_id: getStringField(formData, "client_id"),
    redirect_uri: getStringField(formData, "redirect_uri"),
    resource: getStringField(formData, "resource"),
  })

  return {
    code: parsed.code,
    codeVerifier: parsed.code_verifier,
    clientId: parsed.client_id,
    redirectUri: parsed.redirect_uri,
    resource: parsed.resource,
  }
}

function getStringField(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value : undefined
}

export async function validateOAuthClientRequest(
  input: {
    clientId: string
    redirectUri: string
    resource?: string
  },
  options: {
    expectedResource: string
    store?: OAuthClientStore
  }
) {
  const client = await getOAuthClient(input.clientId, options.store)

  if (!client) throw new Error("Unknown client_id")
  if (!client.redirect_uris.includes(input.redirectUri))
    throw new Error("Invalid redirect_uri")
  if (input.resource && input.resource !== options.expectedResource)
    throw new Error("Invalid resource")

  return client
}
