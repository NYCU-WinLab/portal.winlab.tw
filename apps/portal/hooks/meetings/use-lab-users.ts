"use client"

import { useQuery } from "@tanstack/react-query"

import { isSelectableMember, parseLabStatus } from "@/lib/meetings/lab-status"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

/**
 * Who may be added to the presenter roster or the question pool.
 *
 * A whitelist, not the whole table. This used to be `select id, name from
 * user_profiles` with no filter, so every row showed up as a candidate —
 * graduates, profiles for people who have left the realm, pre-Keycloak shell
 * accounts that were never signed into, faculty and admin staff, and test
 * accounts. Filtering here rather than in the panels keeps both pickers
 * honest from one place.
 *
 * `lab_status` is mirrored from Keycloak nightly by /api/cron/kc-lab-status.
 */
export function useLabUsers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, name, username, lab_status")
        .order("name")
      if (error) throw error

      const rows = data as {
        id: string
        name: string | null
        username: string | null
        lab_status: string | null
      }[]

      return rows
        .filter((row) =>
          isSelectableMember({
            username: row.username,
            labStatus: parseLabStatus(row.lab_status),
          })
        )
        .map((row) => ({ id: row.id, name: row.name }))
    },
  })
}
