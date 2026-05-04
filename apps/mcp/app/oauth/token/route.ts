import { createClient } from "@supabase/supabase-js"

import { exchangeAuthCode } from "@/lib/auth/auth-codes"
import {
  parseTokenAuthorizationCodeRequest,
  validateOAuthClientRequest,
} from "@/lib/auth/oauth-request"
import { verifyPkce } from "@/lib/auth/pkce"
import { getMcpResourceUrl } from "@/lib/auth/urls"
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config"

export async function POST(request: Request) {
  const body = await request.formData()
  const grantType = body.get("grant_type")

  if (grantType === "authorization_code") return handleAuthorizationCode(body)
  if (grantType === "refresh_token") return handleRefreshToken(body)

  return Response.json({ error: "unsupported_grant_type" }, { status: 400 })
}

async function handleAuthorizationCode(body: FormData) {
  let request: ReturnType<typeof parseTokenAuthorizationCodeRequest>

  try {
    request = parseTokenAuthorizationCodeRequest(body)
  } catch (error) {
    return invalidRequest(
      error instanceof Error ? error.message : "Missing code or code_verifier"
    )
  }

  const stored = await exchangeAuthCode(request.code)
  if (!stored) return invalidGrant("Invalid or expired authorization code")

  if (request.redirectUri !== stored.redirectUri)
    return invalidGrant("redirect_uri mismatch")
  if (request.clientId !== stored.clientId)
    return invalidGrant("client_id mismatch")
  if (
    request.resource &&
    stored.resource &&
    request.resource !== stored.resource
  )
    return invalidGrant("resource mismatch")

  try {
    await validateOAuthClientRequest(
      {
        clientId: request.clientId,
        redirectUri: request.redirectUri,
        resource: request.resource,
      },
      { expectedResource: getMcpResourceUrl() }
    )
  } catch (error) {
    return invalidGrant(
      error instanceof Error ? error.message : "Client validation failed"
    )
  }

  if (!verifyPkce(request.codeVerifier, stored.codeChallenge))
    return invalidGrant("PKCE verification failed")

  return Response.json({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    token_type: "Bearer",
    expires_in: stored.expiresIn,
  })
}

async function handleRefreshToken(body: FormData) {
  const refreshToken = body.get("refresh_token")
  if (typeof refreshToken !== "string" || !refreshToken)
    return invalidRequest("Missing refresh_token")

  const supabase = createClient(supabaseUrl, supabasePublishableKey)
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  })

  if (error || !data.session)
    return invalidGrant(error?.message ?? "Refresh failed")

  return Response.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: "Bearer",
    expires_in: data.session.expires_in ?? null,
  })
}

function invalidRequest(description: string) {
  return Response.json(
    { error: "invalid_request", error_description: description },
    { status: 400 }
  )
}

function invalidGrant(description: string) {
  return Response.json(
    { error: "invalid_grant", error_description: description },
    { status: 400 }
  )
}
