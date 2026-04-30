"use client"

import { useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"

export function SignInButton({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const supabase = createClient()
      const callback = new URL(
        "/auth/callback",
        typeof window !== "undefined" ? window.location.origin : ""
      )
      if (next) callback.searchParams.set("next", next)
      await supabase.auth.signInWithOAuth({
        provider: "keycloak",
        options: {
          scopes: "openid",
          redirectTo: callback.toString(),
        },
      })
    })
  }

  return (
    <Button onClick={onClick} disabled={pending} className="w-full">
      {pending ? "Redirecting…" : "Continue with Keycloak"}
    </Button>
  )
}
