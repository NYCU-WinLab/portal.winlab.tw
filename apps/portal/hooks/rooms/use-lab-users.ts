"use client"

import { useQuery } from "@tanstack/react-query"

import {
  getAttendeeGroups,
  getEpicDeliverables,
  getGroupEpics,
} from "@/app/rooms/actions"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export interface LabUser {
  id: string
  name: string | null
  email: string | null
  /** Keycloak account name (`preferred_username`), e.g. "n0ball". */
  username: string | null
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
        .select("id, name, email, username")
        .order("name")
      if (error) throw error
      return (data ?? []).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        username: u.username,
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

/**
 * Open GitLab epics for the group a booking is being made under.
 *
 * Disabled until a group is picked: a personal booking has no epic to attach
 * to, and asking anyway would cost a Keycloak walk to be told so. Short stale
 * time compared to the group list — someone opening an epic and then booking
 * a meeting for it in the same sitting is the expected order of events, not
 * an edge case.
 */
export function useGroupEpics(groupName: string | null) {
  return useQuery({
    queryKey: queryKeys.groupEpics.byGroup(groupName ?? ""),
    queryFn: () => getGroupEpics(groupName),
    enabled: !!groupName,
    staleTime: 60_000,
  })
}

/**
 * What the picked epic's linked issues say this meeting owes.
 *
 * A second round trip, and deliberately only for the epic actually chosen:
 * the deliverables live on the issues under an epic, not on the epic itself,
 * so pre-loading them for a whole group's worth of epics would be one request
 * each to fill a badge row nobody has asked for yet.
 */
export function useEpicDeliverables(
  groupName: string | null,
  iid: number | null
) {
  return useQuery({
    queryKey: queryKeys.epicDeliverables.byEpic(groupName ?? "", iid ?? 0),
    queryFn: () => getEpicDeliverables(groupName, iid!),
    enabled: !!groupName && iid !== null,
    staleTime: 60_000,
  })
}
