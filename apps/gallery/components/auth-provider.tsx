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
