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
  meetings: { year: number } | null
}

export function useQuestionersByYear(year: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.questioners.byYear(year),
    queryFn: async (): Promise<Map<string, MeetingQuestioner[]>> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(
          "meeting_id, user_id, source, assigned_at, user_profiles(name), meetings!inner(year)"
        )
        .eq("meetings.year", year)
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
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.questionPool.all })
      toast.success("已更換提問人")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSyncQuestioners() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (meetingId: string) => {
      const { error } = await supabase.rpc("meetings_sync_questioners", {
        p_meeting_id: meetingId,
      })
      if (error) throw new Error(error.message || "同步提問人失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.questionPool.all })
      toast.success("已重新同步提問人")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
