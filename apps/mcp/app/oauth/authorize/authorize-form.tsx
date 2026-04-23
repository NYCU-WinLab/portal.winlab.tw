"use client"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/browser"

type AuthorizeFormProps = {
  clientId: string
  redirectUri: string
  codeChallenge: string
  resource?: string
  state?: string
}

export function AuthorizeForm({
  clientId,
  redirectUri,
  codeChallenge,
  resource,
  state,
}: AuthorizeFormProps) {
  async function onClick() {
    const supabase = createClient()
    // MCP params piggyback on the callback URL so they survive the Keycloak
    // round-trip. PKCE verifier for the Supabase exchange is cookie-stored
    // by the browser client.
    const callback = new URL("/oauth/callback", window.location.origin)
    callback.searchParams.set("mcp_client_id", clientId)
    callback.searchParams.set("mcp_redirect_uri", redirectUri)
    callback.searchParams.set("mcp_code_challenge", codeChallenge)
    if (state) callback.searchParams.set("mcp_state", state)
    if (resource) callback.searchParams.set("mcp_resource", resource)

    await supabase.auth.signInWithOAuth({
      provider: "keycloak",
      options: {
        scopes: "openid",
        redirectTo: callback.toString(),
      },
    })
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-20">
      <h1 className="mb-2 text-2xl">Authorize MCP client</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Sign in with your WinLab account to let this MCP client reach your
        portal data.
      </p>

      <Button onClick={onClick} className="w-full">
        Continue with Keycloak
      </Button>

      <dl className="mt-8 space-y-1 text-xs text-muted-foreground">
        <div className="flex gap-2">
          <dt>Client</dt>
          <dd className="font-mono break-all">{clientId}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Redirects to</dt>
          <dd className="font-mono break-all">{redirectUri}</dd>
        </div>
      </dl>
    </main>
  )
}
