import { NextResponse } from "next/server"

import { createAuthCode } from "@/lib/auth/auth-codes"
import { validateOAuthClientRequest } from "@/lib/auth/oauth-request"
import { getMcpResourceUrl } from "@/lib/auth/urls"
import { createClient } from "@/lib/supabase/ssr-server"

// Lands here after the user finishes Keycloak login (via Supabase).
// Supabase gives us ?code=<supabase-pkce-code>; MCP params piggyback as
// mcp_* query params from the authorize step. We:
//   1. Trade the Supabase code for a session (RFC 7636 PKCE via cookies).
//   2. Re-validate the MCP client + redirect_uri.
//   3. Mint a one-time MCP auth code that bundles the session tokens.
//   4. Send the browser back to the MCP client's redirect_uri with our code.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const supabaseCode = url.searchParams.get("code")
  const mcpClientId = url.searchParams.get("mcp_client_id")
  const mcpRedirectUri = url.searchParams.get("mcp_redirect_uri")
  const mcpCodeChallenge = url.searchParams.get("mcp_code_challenge")
  const mcpState = url.searchParams.get("mcp_state") ?? undefined
  const mcpResource = url.searchParams.get("mcp_resource") ?? undefined

  if (!supabaseCode) {
    return errorPage("Missing authorization code from Supabase.")
  }
  if (!mcpClientId || !mcpRedirectUri || !mcpCodeChallenge) {
    return errorPage("Missing MCP authorization parameters.")
  }

  try {
    await validateOAuthClientRequest(
      {
        clientId: mcpClientId,
        redirectUri: mcpRedirectUri,
        resource: mcpResource,
      },
      { expectedResource: getMcpResourceUrl() }
    )
  } catch (error) {
    return errorPage(
      error instanceof Error ? error.message : "Invalid MCP client request"
    )
  }

  const supabase = await createClient()
  const { data, error } =
    await supabase.auth.exchangeCodeForSession(supabaseCode)

  if (error || !data.session) {
    return errorPage(error?.message ?? "Supabase session exchange failed")
  }

  const mcpCode = await createAuthCode({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in ?? null,
    codeChallenge: mcpCodeChallenge,
    redirectUri: mcpRedirectUri,
    clientId: mcpClientId,
    resource: mcpResource,
  })

  const redirect = new URL(mcpRedirectUri)
  redirect.searchParams.set("code", mcpCode)
  if (mcpState) redirect.searchParams.set("state", mcpState)

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
