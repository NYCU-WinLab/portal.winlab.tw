"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { fetchQuestionersByYear } from "@/lib/meetings/fetch"
import type { MeetingQuestioner } from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

export function useQuestionersByYear(year: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.questioners.byYear(year),
    queryFn: (): Promise<Map<string, MeetingQuestioner[]>> =>
      fetchQuestionersByYear(supabase, year),
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
