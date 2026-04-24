"use client"

import { useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"

export function SignInButton() {
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signInWithOAuth({
        provider: "keycloak",
        options: {
          scopes: "openid",
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
    })
  }

  return (
    <Button onClick={onClick} disabled={pending} className="w-full">
      {pending ? "Redirecting..." : "Continue with Keycloak"}
    </Button>
  )
}
