"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { ScheduleYearBounds } from "@/lib/meetings/schedule-year"

import { queryKeys } from "./query-keys"

const TABLE = "meetings"

/**
 * The two facts /meetings needs about the schedule before it can pick a year to
 * show: which bucket the next meeting is in, and how far the buckets run. Two
 * `limit(1)` reads rather than pulling the table down — see
 * `lib/meetings/schedule-year.ts` for why neither can be derived from the clock.
 */
export function useScheduleYears() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.meetings.years,
    queryFn: async (): Promise<ScheduleYearBounds> => {
      // Pinned to Taipei like the fill-presenters button and the RPC it mirrors:
      // the database session is UTC, so a Taipei morning would otherwise count
      // as "yesterday" for eight hours and could skip a meeting happening today.
      const today = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Taipei",
      }).format(new Date())

      const [upcoming, latest] = await Promise.all([
        supabase
          .from(TABLE)
          .select("year")
          .gte("scheduled_date", today)
          // Holidays are rows but not meetings. Counting one would send the page
          // to whichever bucket holds the next 元旦 / 月考週 marker instead of the
          // bucket holding the next actual presentation — which is the whole
          // question being asked here.
          .eq("is_holiday", false)
          .order("scheduled_date", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from(TABLE)
          .select("year")
          .order("year", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (upcoming.error) throw new Error(upcoming.error.message)
      if (latest.error) throw new Error(latest.error.message)

      return {
        upcoming: upcoming.data?.year ?? null,
        latest: latest.data?.year ?? null,
      }
    },
  })
}
