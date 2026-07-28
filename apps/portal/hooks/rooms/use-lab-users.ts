"use client"

import { useQuery } from "@tanstack/react-query"

import { getAttendeeGroups } from "@/app/rooms/actions"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export interface LabUser {
  id: string
  name: string | null
  email: string | null
  /** The 系計中 account id — the local part of the email, e.g. "cctseng". */
  accountId: string | null
}

/**
 * Lab members, for the attendee picker. Deliberately a rooms-local copy of
 * the same shape meetings uses — the two features just happen to need the
 * same list, and sharing a hook across apps would couple them.
 */
export function useLabUsers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.labUsers.all,
    queryFn: async (): Promise<LabUser[]> => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, name, email")
        .order("name")
      if (error) throw error
      return (data ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        accountId: u.email ? (u.email.split("@")[0] ?? null) : null,
      }))
    },
    staleTime: 5 * 60_000,
  })
}

/**
 * Keycloak subgroups mapped onto portal users. Empty when Keycloak isn't
 * configured or the admin client lacks group-read permission — the picker
 * just doesn't show the group shortcuts in that case.
 */
export function useAttendeeGroups() {
  return useQuery({
    queryKey: queryKeys.attendeeGroups.all,
    queryFn: () => getAttendeeGroups(),
    staleTime: 5 * 60_000,
  })
}
