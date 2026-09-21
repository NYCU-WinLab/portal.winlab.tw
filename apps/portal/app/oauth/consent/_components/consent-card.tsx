"use client"

import { useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"

type ClientInfo = { name: string; uri: string | null }

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "redirecting" }
  | { kind: "ready"; client: ClientInfo; scopes: string[]; email: string }

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  email: "See your email address",
  profile: "See your name and avatar",
  phone: "See your phone number",
}

export function ConsentCard({
  authorizationId,
}: {
  authorizationId: string | null
}) {
  const [state, setState] = useState<State>(() =>
    authorizationId
      ? { kind: "loading" }
      : { kind: "error", message: "Missing authorization_id." }
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!authorizationId) return
    let cancelled = false
    const supabase = createClient()
    supabase.auth.oauth
      .getAuthorizationDetails(authorizationId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setState({
            kind: "error",
            message: error?.message ?? "Could not load this request.",
          })
          return
        }
        if ("redirect_url" in data) {
          setState({ kind: "redirecting" })
          window.location.assign(data.redirect_url)
          return
        }
        setState({
          kind: "ready",
          client: { name: data.client.name, uri: data.client.uri || null },
          scopes: data.scope.split(" ").filter(Boolean),
          email: data.user.email,
        })
      })
    return () => {
      cancelled = true
    }
  }, [authorizationId])

  async function decide(approve: boolean) {
    if (!authorizationId) return
    setBusy(true)
    const supabase = createClient()
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId)
    if (error || !data) {
      setBusy(false)
      setState({
        kind: "error",
        message: error?.message ?? "The decision did not go through.",
      })
      return
    }
    setState({ kind: "redirecting" })
    window.location.assign(data.redirect_url)
  }

  if (state.kind === "loading") {
    return <p className="text-sm text-muted-foreground">Loading request…</p>
  }
  if (state.kind === "redirecting") {
    return <p className="text-sm text-muted-foreground">Redirecting…</p>
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Authorization failed</h1>
        <p className="text-sm text-muted-foreground">{state.message}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">
          Allow {state.client.name} to use portal as you?
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {state.email}.
          {state.client.uri ? ` Requested by ${state.client.uri}.` : ""}
        </p>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        <li>Act on portal with your permissions (receipts and more)</li>
        {state.scopes.map((scope) => (
          <li key={scope}>{SCOPE_LABELS[scope] ?? scope}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          className="flex-1"
          disabled={busy}
          onClick={() => decide(false)}
        >
          Deny
        </Button>
        <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
          {busy ? "Working…" : "Allow"}
        </Button>
      </div>
    </div>
  )
}
