"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import {
  toSemester,
  type DbSemester,
  type Semester,
} from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

const TABLE = "meeting_semesters"

export function useSemesters() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.meetings.semesters,
    queryFn: async (): Promise<Semester[]> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("start_date", { ascending: true })
      if (error) throw new Error(error.message || "讀取學期失敗")
      return (data as DbSemester[]).map(toSemester)
    },
  })
}
