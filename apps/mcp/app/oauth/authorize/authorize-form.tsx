"use client"

import { Button } from "@workspace/ui/components/button"
import { useState } from "react"

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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onClick() {
    setLoading(true)
    setError(null)

    // Stash MCP params server-side first so redirectTo stays clean —
    // Supabase rejects redirectTo URLs with query strings when they don't
    // exactly match the allowlist entry.
    const prepared = await fetch("/oauth/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        state,
        resource,
      }),
    })

    if (!prepared.ok) {
      const body = await prepared.json().catch(() => ({}))
      setError(body.error_description ?? "Failed to prepare authorization")
      setLoading(false)
      return
    }

    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: "keycloak",
      options: {
        scopes: "openid",
        redirectTo: `${window.location.origin}/oauth/callback`,
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

      <Button onClick={onClick} disabled={loading} className="w-full">
        {loading ? "Redirecting…" : "Continue with Keycloak"}
      </Button>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}

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
