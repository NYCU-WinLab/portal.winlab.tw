"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import { toMeeting, type DbMeeting, type Meeting } from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

const TABLE = "meetings"

export function useMeetings(year: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.meetings.byYear(year),
    queryFn: async (): Promise<Meeting[]> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .eq("year", year)
        .order("scheduled_date", { ascending: true })
      if (error) throw new Error(error.message || "讀取排班失敗")
      return (data as DbMeeting[]).map(toMeeting)
    },
  })
}

export function useUpdateOwnMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      presenter,
      presenterUserId,
      paperTitle,
      paperLink,
      pptUploaded,
      pptLink,
      videoUploaded,
      videoLink,
      notes,
    }: {
      id: string
      presenter: string | null
      presenterUserId: string | null
      paperTitle: string | null
      paperLink: string | null
      pptUploaded: boolean
      pptLink: string | null
      videoUploaded: boolean
      videoLink: string | null
      notes: string | null
    }) => {
      const { error } = await supabase
        .from(TABLE)
        .update({
          presenter,
          presenter_user_id: presenterUserId,
          paper_title: paperTitle,
          paper_link: paperLink,
          ppt_uploaded: pptUploaded,
          ppt_link: pptLink,
          video_uploaded: videoUploaded,
          video_link: videoLink,
          notes,
        })
        .eq("id", id)
      if (error) throw new Error(error.message || "更新失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      toast.success("已儲存")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useClaimMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      presenter,
      presenterUserId,
    }: {
      id: string
      presenter: string
      presenterUserId: string
    }) => {
      const { error } = await supabase
        .from(TABLE)
        .update({ presenter, presenter_user_id: presenterUserId })
        .eq("id", id)
      if (error) throw new Error(error.message || "認領失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      toast.success("已認領")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAdminUpdateMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      weekLabel,
      scheduledDate,
      isHoliday,
      presenter,
      presenterUserId,
      paperTitle,
      paperLink,
      pptUploaded,
      pptLink,
      videoUploaded,
      videoLink,
      notes,
    }: {
      id: string
      weekLabel: string | null
      scheduledDate: string
      isHoliday: boolean
      presenter: string | null
      presenterUserId: string | null
      paperTitle: string | null
      paperLink: string | null
      pptUploaded: boolean
      pptLink: string | null
      videoUploaded: boolean
      videoLink: string | null
      notes: string | null
    }) => {
      const { error } = await supabase
        .from(TABLE)
        .update({
          week_label: weekLabel,
          scheduled_date: scheduledDate,
          is_holiday: isHoliday,
          presenter,
          presenter_user_id: presenterUserId,
          paper_title: paperTitle,
          paper_link: paperLink,
          ppt_uploaded: pptUploaded,
          ppt_link: pptLink,
          video_uploaded: videoUploaded,
          video_link: videoLink,
          notes,
        })
        .eq("id", id)
      if (error) throw new Error(error.message || "更新失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      toast.success("已儲存")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (row: {
      year: number
      weekLabel: string | null
      scheduledDate: string
      isHoliday: boolean
      presenter: string | null
      presenterUserId: string | null
    }) => {
      const { error } = await supabase.from(TABLE).insert({
        year: row.year,
        week_label: row.weekLabel,
        scheduled_date: row.scheduledDate,
        is_holiday: row.isHoliday,
        presenter: row.presenter,
        presenter_user_id: row.presenterUserId,
      })
      if (error) throw new Error(error.message || "新增失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      toast.success("週次已新增")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE).delete().eq("id", id)
      if (error) throw new Error(error.message || "刪除失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      toast.success("已刪除")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSyncMeetingFiles() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (year: number) => {
      const res = await fetch("/api/meetings/sync-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "掃描失敗")
      }
      return res.json() as Promise<{ pptUpdated: number; videoUpdated: number }>
    },
    onSuccess: ({ pptUpdated, videoUpdated }) => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      toast.success(
        `掃描完成：PPT ${pptUpdated} 筆、錄影 ${videoUpdated} 筆已連結`
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
