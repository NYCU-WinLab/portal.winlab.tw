"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { createClient } from "@/lib/supabase/client"

const NEXT_STORAGE_KEY = "gallery:auth:next"

// Stash `next` in sessionStorage instead of stuffing it into the redirectTo
// query string. Supabase matches redirect URLs *exactly* against the allow
// list (query params included). Any extra `?next=...` makes the redirect_to
// fail allow-list validation, and Supabase silently falls back to Site URL
// (Dashboard setting — often prod or one localhost port — hence odd hops).
//
// The callback route reads the same key on success and resumes navigation.
export function SignInButton({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      try {
        if (typeof window !== "undefined" && next && next.startsWith("/")) {
          try {
            sessionStorage.setItem(NEXT_STORAGE_KEY, next)
          } catch {
            /* private mode etc — fine, callback just sends to "/" */
          }
        }
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "keycloak",
          options: {
            scopes: "openid",
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (error) {
          toast.error(error.message || "Could not start sign-in.")
        }
      } catch {
        toast.error("Could not start sign-in.")
      }
    })
  }

  return (
    <Button
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
      className="w-full"
    >
      {pending ? "Redirecting…" : "Continue with Keycloak"}
    </Button>
  )
}

export { NEXT_STORAGE_KEY }
