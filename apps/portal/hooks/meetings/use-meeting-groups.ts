"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import {
  toMeetingGroup,
  type DbMeetingGroup,
  type MeetingGroup,
} from "@/lib/meetings/types"

export function useMeetingGroups() {
  const supabase = createClient()

  return useQuery({
    queryKey: ["meeting_groups"],
    queryFn: async (): Promise<MeetingGroup[]> => {
      const { data, error } = await supabase
        .from("meeting_groups")
        .select("*")
        .order("group_number")
      if (error) throw new Error(error.message)
      return (data as DbMeetingGroup[]).map(toMeetingGroup)
    },
  })
}

export function useUpdateMeetingGroup() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      groupNumber,
      members,
    }: {
      groupNumber: number
      members: string[]
    }) => {
      const { error } = await supabase
        .from("meeting_groups")
        .update({ members, updated_at: new Date().toISOString() })
        .eq("group_number", groupNumber)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meeting_groups"] })
      toast.success("小組已更新")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddMeetingGroup() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nextNumber: number) => {
      const { error } = await supabase
        .from("meeting_groups")
        .insert({ group_number: nextNumber, members: [] })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meeting_groups"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteMeetingGroup() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (groupNumber: number) => {
      const { error } = await supabase
        .from("meeting_groups")
        .delete()
        .eq("group_number", groupNumber)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meeting_groups"] })
      toast.success("小組已刪除")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
