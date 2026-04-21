"use client"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"

export function SignInButton() {
  async function onClick() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: "keycloak",
      options: {
        scopes: "openid",
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <Button onClick={onClick} className="w-full">
      Continue with Keycloak
    </Button>
  )
}
