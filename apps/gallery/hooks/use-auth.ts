"use client"

import type { User } from "@supabase/supabase-js"
import { createContext, useContext } from "react"

export type AuthContextValue = {
  user: User | null
  loading: boolean
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refreshUser: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}
