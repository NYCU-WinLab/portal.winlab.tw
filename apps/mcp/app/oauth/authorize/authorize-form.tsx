"use client"

import { Button } from "@workspace/ui/components/button"
import { useState } from "react"

import { createClient } from "@/lib/supabase/browser"

type AuthorizeFormProps = {
  clientId: string
  clientName: string
  redirectUri: string
  codeChallenge: string
  resource?: string
  state?: string
}

export function AuthorizeForm({
  clientId,
  clientName,
  redirectUri,
  codeChallenge,
  resource,
  state,
}: AuthorizeFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  let redirectHost = ""
  let isExternalRedirect = false
  try {
    const parsed = new URL(redirectUri)
    redirectHost = parsed.host
    isExternalRedirect = !redirectHost.endsWith(".winlab.tw")
  } catch {
    // malformed URI — server validation already caught this; show as-is
    redirectHost = redirectUri
    isExternalRedirect = true
  }

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
      <p className="mb-6 text-sm text-muted-foreground">
        Sign in with your WinLab account to grant{" "}
        <span className="font-semibold text-foreground">{clientName}</span>{" "}
        access to your portal data.
      </p>

      {isExternalRedirect ? (
        <div
          role="alert"
          className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <strong>Warning:</strong> This client will redirect your authorization
          to an external domain:{" "}
          <span className="font-mono font-semibold">{redirectHost}</span>.
          Only continue if you trust this application.
        </div>
      ) : null}

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
          <dd className="break-all font-mono">{clientName}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Redirects to</dt>
          <dd className="break-all font-mono font-semibold text-foreground">
            {redirectHost}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Client ID</dt>
          <dd className="break-all font-mono opacity-60">{clientId}</dd>
        </div>
      </dl>
    </main>
  )
}
