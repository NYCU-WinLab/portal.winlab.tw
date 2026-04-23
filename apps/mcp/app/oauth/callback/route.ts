import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { createAuthCode } from "@/lib/auth/auth-codes"
import { validateOAuthClientRequest } from "@/lib/auth/oauth-request"
import { getMcpResourceUrl } from "@/lib/auth/urls"
import { createClient } from "@/lib/supabase/ssr-server"

import { MCP_OAUTH_STATE_COOKIE } from "@/app/oauth/prepare/route"

// Lands here after the user finishes Keycloak login (via Supabase).
// Supabase gives us ?code=<supabase-pkce-code>; MCP params live in an
// httpOnly cookie stashed by /oauth/prepare so the redirectTo URL stays
// clean (Supabase's allowlist is picky about query strings).
export async function GET(request: Request) {
  const url = new URL(request.url)
  const supabaseCode = url.searchParams.get("code")

  if (!supabaseCode) {
    return errorPage("Missing authorization code from Supabase.")
  }

  const cookieStore = await cookies()
  const mcpStateRaw = cookieStore.get(MCP_OAUTH_STATE_COOKIE)?.value
  if (!mcpStateRaw) {
    return errorPage(
      "Missing MCP request state. The cookie has expired or was blocked."
    )
  }

  let mcp: {
    client_id: string
    redirect_uri: string
    code_challenge: string
    state?: string
    resource?: string
  }
  try {
    mcp = JSON.parse(mcpStateRaw)
  } catch {
    cookieStore.delete(MCP_OAUTH_STATE_COOKIE)
    return errorPage("Corrupted MCP request state.")
  }

  try {
    await validateOAuthClientRequest(
      {
        clientId: mcp.client_id,
        redirectUri: mcp.redirect_uri,
        resource: mcp.resource,
      },
      { expectedResource: getMcpResourceUrl() }
    )
  } catch (error) {
    cookieStore.delete(MCP_OAUTH_STATE_COOKIE)
    return errorPage(
      error instanceof Error ? error.message : "Invalid MCP client request"
    )
  }

  const supabase = await createClient()
  const { data, error } =
    await supabase.auth.exchangeCodeForSession(supabaseCode)

  if (error || !data.session) {
    cookieStore.delete(MCP_OAUTH_STATE_COOKIE)
    return errorPage(error?.message ?? "Supabase session exchange failed")
  }

  const mcpCode = await createAuthCode({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in ?? null,
    codeChallenge: mcp.code_challenge,
    redirectUri: mcp.redirect_uri,
    clientId: mcp.client_id,
    resource: mcp.resource,
  })

  cookieStore.delete(MCP_OAUTH_STATE_COOKIE)

  const redirect = new URL(mcp.redirect_uri)
  redirect.searchParams.set("code", mcpCode)
  if (mcp.state) redirect.searchParams.set("state", mcp.state)

  return NextResponse.redirect(redirect.toString())
}

function errorPage(message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Authorization failed</title>
<main style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>Authorization failed</h1>
<p style="color:#b91c1c">${escapeHtml(message)}</p>
<p style="color:#64748b;font-size:.875rem">Return to your MCP client and retry the authorization flow.</p>
</main>`,
    {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    }
  )
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
