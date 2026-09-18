"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type { MeetingQuestioner } from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

const TABLE = "meeting_questioners"

interface RawQuestionerRow {
  meeting_id: string
  user_id: string
  source: "auto" | "manual"
  assigned_at: string
  user_profiles: { name: string | null } | null
  meetings: { scheduled_date: string } | null
}

export function useQuestionersByYear(year: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.questioners.byYear(year),
    queryFn: async (): Promise<Map<string, MeetingQuestioner[]>> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(
          "meeting_id, user_id, source, assigned_at, user_profiles(name), meetings!inner(scheduled_date)"
        )
        .gte("meetings.scheduled_date", `${year}-01-01`)
        .lte("meetings.scheduled_date", `${year}-12-31`)
        .order("assigned_at", { ascending: true })
      if (error) throw new Error(error.message || "讀取提問人失敗")

      const byMeeting = new Map<string, MeetingQuestioner[]>()
      for (const row of (data ?? []) as unknown as RawQuestionerRow[]) {
        const questioner: MeetingQuestioner = {
          meetingId: row.meeting_id,
          userId: row.user_id,
          name: row.user_profiles?.name ?? null,
          source: row.source,
        }
        const existing = byMeeting.get(row.meeting_id)
        if (existing) {
          existing.push(questioner)
        } else {
          byMeeting.set(row.meeting_id, [questioner])
        }
      }
      return byMeeting
    },
  })
}

export function useReplaceQuestioner() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      meetingId,
      removeUserId,
      replacementUserId,
    }: {
      meetingId: string
      removeUserId: string
      replacementUserId?: string | null
    }) => {
      const { error } = await supabase.rpc("meetings_replace_questioner", {
        p_meeting_id: meetingId,
        p_remove_user: removeUserId,
        p_replacement: replacementUserId ?? undefined,
      })
      if (error) throw new Error(error.message || "更換提問人失敗")
    },
    onSuccess: () => {
      // The swap shifts one seat between two members; the reconcile at commit
      // evens that out in later weeks, so every roster may have moved.
      qc.invalidateQueries({ queryKey: queryKeys.questioners.all })
      qc.invalidateQueries({ queryKey: queryKeys.questionPool.all })
      toast.success("已更換提問人")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
