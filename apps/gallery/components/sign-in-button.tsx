"use client"

import { useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"

const NEXT_STORAGE_KEY = "gallery:auth:next"

// Stash `next` in sessionStorage instead of stuffing it into the redirectTo
// query string. Supabase matches redirect URLs *exactly* against the allow
// list (query params included). Any extra `?next=...` makes the redirect_to
// fail allow-list validation, and Supabase silently falls back to Site URL
// (which is still http://localhost:3000 on this project, hence the famous
// "I logged in on prod and ended up on localhost" head-scratcher).
//
// The callback route reads the same key on success and resumes navigation.
export function SignInButton({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      if (typeof window !== "undefined" && next && next.startsWith("/")) {
        try {
          sessionStorage.setItem(NEXT_STORAGE_KEY, next)
        } catch {
          /* private mode etc — fine, callback just sends to "/" */
        }
      }
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
      {pending ? "Redirecting…" : "Continue with Keycloak"}
    </Button>
  )
}

export { NEXT_STORAGE_KEY }
