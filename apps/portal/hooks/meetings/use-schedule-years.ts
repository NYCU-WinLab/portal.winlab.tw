"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import { fetchScheduleYearBounds } from "@/lib/meetings/fetch"
import type { ScheduleYearBounds } from "@/lib/meetings/schedule-year"

import { queryKeys } from "./query-keys"

/**
 * The two facts /meetings needs about the schedule before it can pick a year to
 * show, read through `fetchScheduleYearBounds`.
 */
export function useScheduleYears() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.meetings.years,
    queryFn: (): Promise<ScheduleYearBounds> => {
      // Pinned to Taipei like the fill-presenters button and the RPC it mirrors:
      // the database session is UTC, so a Taipei morning would otherwise count
      // as "yesterday" for eight hours and could skip a meeting happening today.
      const today = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Taipei",
      }).format(new Date())

      return fetchScheduleYearBounds(supabase, today)
    },
  })
}
