"use client"

import type { User } from "@supabase/supabase-js"
import { useEffect, useState, type ReactNode } from "react"

import { AuthContext } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: User | null
  children: ReactNode
}) {
  const [user, setUser] = useState<User | null>(initialUser)
  const [supabase] = useState(() => createClient())

  const refreshUser = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
    } catch {
      setUser(null)
    }
  }

  // Self-heal for stale localStorage. If the server authoritatively says
  // we're not signed in but there's still an `sb-*` shard in localStorage,
  // the local state is dead weight — most likely a refresh_token the old
  // portal left here that's been revoked/rotated since. Leaving it would
  // kick off @supabase/ssr's auto-refresh timer, which hammers /token
  // trying to revive a corpse and eventually hits rate-limit 429s.
  //
  // signOut({ scope: "local" }) clears storage and stops the timer
  // without a network call — no rate-limit burn, no cross-device blast.
  useEffect(() => {
    if (initialUser) return
    let hasStaleState = false
    try {
      hasStaleState = Object.keys(localStorage).some((k) => k.startsWith("sb-"))
    } catch {
      return // SSR or private mode — nothing to do
    }
    if (!hasStaleState) return

    supabase.auth.signOut({ scope: "local" }).catch(() => {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("sb-"))
          .forEach((k) => localStorage.removeItem(k))
      } catch {
        /* give up silently */
      }
    })
  }, [initialUser, supabase])

  useEffect(() => {
    let mounted = true

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  return (
    <AuthContext.Provider value={{ user, loading: false, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
