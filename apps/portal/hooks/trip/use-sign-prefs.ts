"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { SignaturePosition } from "@/lib/trip/sign"

import { queryKeys } from "./query-keys"

export type SignPrefs = {
  enabled: boolean
  corner: SignaturePosition
}

const DEFAULT_PREFS: SignPrefs = { enabled: false, corner: "br" }

const PREFS_KEY = (userId: string) => ["trip", "sign-prefs", userId] as const

export function useSignPrefs(userId: string | null | undefined) {
  const supabase = createClient()

  const query = useQuery({
    queryKey: PREFS_KEY(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<SignPrefs> => {
      const { data, error } = await supabase
        .from("user_sign_prefs")
        .select("enabled, corner")
        .eq("user_id", userId!)
        .maybeSingle()
      if (error) throw error
      if (!data) return DEFAULT_PREFS
      return {
        enabled: !!data.enabled,
        corner: (data.corner ?? "br") as SignaturePosition,
      }
    },
    placeholderData: DEFAULT_PREFS,
  })

  return { prefs: query.data ?? DEFAULT_PREFS, ...query }
}

export function useUpdateSignPrefs(userId: string | null | undefined) {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (next: Partial<SignPrefs>) => {
      if (!userId) throw new Error("not signed in")
      const { error } = await supabase.from("user_sign_prefs").upsert(
        {
          user_id: userId,
          enabled: next.enabled,
          corner: next.corner,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      if (error) throw error
    },
    onMutate: async (next) => {
      if (!userId) return
      await qc.cancelQueries({ queryKey: PREFS_KEY(userId) })
      const prev = qc.getQueryData<SignPrefs>(PREFS_KEY(userId))
      qc.setQueryData<SignPrefs>(PREFS_KEY(userId), {
        enabled: next.enabled ?? prev?.enabled ?? false,
        corner: next.corner ?? prev?.corner ?? "br",
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (userId && ctx?.prev) {
        qc.setQueryData(PREFS_KEY(userId), ctx.prev)
      }
    },
    onSettled: () => {
      if (userId) qc.invalidateQueries({ queryKey: PREFS_KEY(userId) })
    },
  })
}

export type MemberSignature = {
  member_id: string
  signature: string
  enabled: boolean
  corner: SignaturePosition
}

// Admin-only: fetch saved signature + pref for every member who has files
// in the trip. RPC enforces is_trip_admin() server-side.
export function useTripMemberSignatures(tripId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: [...queryKeys.files.byTrip(tripId ?? ""), "member-sigs"] as const,
    enabled: !!tripId,
    queryFn: async (): Promise<Map<string, MemberSignature>> => {
      const { data, error } = await supabase.rpc(
        "trip_admin_get_member_signatures",
        { p_trip_id: tripId! }
      )
      if (error) throw error
      const map = new Map<string, MemberSignature>()
      for (const row of (data ?? []) as Array<{
        member_id: string
        signature: string
        enabled: boolean
        corner: string
      }>) {
        map.set(row.member_id, {
          member_id: row.member_id,
          signature: row.signature,
          enabled: !!row.enabled,
          corner: (row.corner ?? "br") as SignaturePosition,
        })
      }
      return map
    },
  })
}
