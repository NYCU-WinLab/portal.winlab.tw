"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

// Saved signatures live in approve_user_field_values (category='signature').
// The table is RLS'd to user_id = auth.uid(), so any portal app may read or
// upsert the current user's value. Same row ⇒ approve & trip share signature.

const QUERY_KEY = (userId: string) => ["saved-signature", userId] as const

export function useSavedSignature(userId: string | null | undefined) {
  const supabase = createClient()

  const query = useQuery({
    queryKey: QUERY_KEY(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approve_user_field_values")
        .select("value")
        .eq("user_id", userId!)
        .eq("category", "signature")
        .maybeSingle()
      if (error) throw error
      return data?.value ?? null
    },
  })

  return { signature: query.data ?? null, ...query }
}

export function useSaveSignature(userId: string | null | undefined) {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (value: string) => {
      if (!userId) throw new Error("not signed in")
      const { error } = await supabase.from("approve_user_field_values").upsert(
        {
          user_id: userId,
          category: "signature",
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,category" }
      )
      if (error) throw error
    },
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: QUERY_KEY(userId) })
    },
  })
}
