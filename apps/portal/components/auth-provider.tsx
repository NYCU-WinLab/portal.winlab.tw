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

  // Self-heal for stale localStorage in two shapes:
  //
  //   1. Server says "not signed in" but localStorage still has `sb-*`
  //      shards — most likely a revoked/rotated refresh_token the SDK's
  //      auto-refresh timer would otherwise hammer /token to revive,
  //      eventually hitting 429s.
  //
  //   2. Server says "signed in as B" but localStorage has `sb-*` whose
  //      embedded `user.id` is A — happens after a Keycloak account
  //      switch on a shared machine. The SDK's userStorage path can pick
  //      up A's revoked token and produce the same 429 storm.
  //
  // Case 1: signOut({ scope: "local" }) clears storage and stops the
  // timer without a network call. Case 2: surgically remove only the
  // mismatched key — don't touch the live session.
  useEffect(() => {
    const stale: string[] = []
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith("sb-")) continue
        if (!initialUser) {
          stale.push(key)
          continue
        }
        try {
          const raw = localStorage.getItem(key)
          if (!raw) continue
          const parsed = JSON.parse(raw)
          const sub: unknown =
            parsed?.user?.id ?? parsed?.currentSession?.user?.id
          if (typeof sub === "string" && sub !== initialUser.id) {
            stale.push(key)
          }
        } catch {
          // Unparseable blob — leave it for client.ts's purge to handle.
        }
      }
    } catch {
      return // SSR or private mode — nothing to do
    }

    if (stale.length === 0) return

    if (!initialUser) {
      supabase.auth.signOut({ scope: "local" }).catch(() => {
        try {
          stale.forEach((k) => localStorage.removeItem(k))
        } catch {
          /* give up silently */
        }
      })
      return
    }

    try {
      stale.forEach((k) => localStorage.removeItem(k))
    } catch {
      /* give up silently */
    }
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
