"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { ScheduleYearBounds } from "@/lib/meetings/schedule-year"

import { queryKeys } from "./query-keys"

const TABLE = "meetings"

/**
 * The two facts /meetings needs about the schedule before it can pick a year to
 * show: the date of the next meeting, and the date of the last row in the
 * whole schedule. Two `limit(1)` reads rather than pulling the table down —
 * see `lib/meetings/schedule-year.ts` for why neither can be derived from the
 * clock.
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
          .select("scheduled_date")
          .gte("scheduled_date", today)
          // Holidays are rows but not meetings. Counting one would return the
          // date of the next 元旦 / 月考週 marker instead of the date of the
          // next actual presentation — which is the whole question being
          // asked here.
          .eq("is_holiday", false)
          .order("scheduled_date", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from(TABLE)
          .select("scheduled_date")
          .order("scheduled_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (upcoming.error) throw new Error(upcoming.error.message)
      if (latest.error) throw new Error(latest.error.message)

      return {
        upcomingDate: upcoming.data?.scheduled_date ?? null,
        latestDate: latest.data?.scheduled_date ?? null,
      }
    },
  })
}
