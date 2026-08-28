"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type { TablesInsert } from "@/lib/supabase/database.types"
import { toMeeting, type DbMeeting, type Meeting } from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

const TABLE = "meetings"

// The DB enforces two paper rules (see the reading-list migration). Turn the
// raw Postgres violations into something a student can act on:
//   * 23P01 exclusion → the 365-day cooldown window (meetings_paper_cooldown).
//   * 23505 unique on meetings_presenter_paper_uniq → same student, same paper.
function paperErrorMessage(error: { code?: string; message?: string }): string {
  const msg = error.message ?? ""
  if (error.code === "23P01" || msg.includes("meetings_paper_cooldown")) {
    return "這篇 paper 一年內剛被報告過，冷卻中，請改選其他 paper"
  }
  if (error.code === "23505" && msg.includes("presenter_paper")) {
    return "你已經報告過這篇 paper 了，不能再選同一篇"
  }
  if (error.code === "23505") {
    return "這篇 paper 已被其他人選走了，請選別篇"
  }
  return msg || "更新失敗"
}

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
      teacherPaperId,
      paperTitle,
      pptUploaded,
      pptLink,
      videoUploaded,
      videoLink,
      notes,
    }: {
      id: string
      teacherPaperId: string | null
      /** Thesis weeks only — the presenter types their own title. */
      paperTitle?: string | null
      pptUploaded: boolean
      pptLink: string | null
      videoUploaded: boolean
      videoLink: string | null
      notes: string | null
    }) => {
      // Deliberately narrow: meetings_guard_columns silently restores OLD for
      // every column an admin owns (presenter, dates, week kind, paper_link), so
      // sending them here would look like it worked and change nothing.
      const { error } = await supabase
        .from(TABLE)
        .update({
          teacher_paper_id: teacherPaperId,
          ppt_uploaded: pptUploaded,
          ppt_link: pptLink,
          video_uploaded: videoUploaded,
          video_link: videoLink,
          notes,
          // Only accepted on a week an admin already flagged is_thesis.
          ...(paperTitle !== undefined ? { paper_title: paperTitle } : {}),
        })
        .eq("id", id)
      if (error) throw new Error(paperErrorMessage(error))

      const { error: syncError } = await supabase.rpc(
        "meetings_sync_questioners",
        { p_meeting_id: id }
      )
      if (syncError) throw new Error(syncError.message || "同步提問人失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.paperAssignments.all })
      toast.success("已儲存")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useClaimMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (meetingId: string) => {
      const { error } = await supabase.rpc("meetings_claim", {
        p_meeting_id: meetingId,
      })
      if (error) throw new Error(error.message || "認領失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.paperAssignments.all })
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
      isSpeaker,
      isThesis,
      presenter,
      presenterUserId,
      teacherPaperId,
      paperTitle,
      pptUploaded,
      pptLink,
      videoUploaded,
      videoLink,
      notes,
      location,
      startTime,
    }: {
      id: string
      weekLabel: string | null
      scheduledDate: string
      isHoliday: boolean
      isSpeaker: boolean
      isThesis: boolean
      presenter: string | null
      presenterUserId: string | null
      teacherPaperId: string | null
      paperTitle?: string | null
      pptUploaded: boolean
      pptLink: string | null
      videoUploaded: boolean
      videoLink: string | null
      notes: string | null
      location: string
      startTime: string
    }) => {
      const { error } = await supabase
        .from(TABLE)
        .update({
          week_label: weekLabel,
          scheduled_date: scheduledDate,
          is_holiday: isHoliday,
          is_speaker: isSpeaker,
          is_thesis: isThesis,
          presenter,
          presenter_user_id: presenterUserId,
          teacher_paper_id: teacherPaperId,
          ppt_uploaded: pptUploaded,
          ppt_link: pptLink,
          video_uploaded: videoUploaded,
          video_link: videoLink,
          notes,
          location,
          start_time: startTime,
          // Speaker and thesis weeks keep their typed title in paper_title
          // (teacher_paper_id null → sync trigger normalizes and keeps it). Only
          // sent when provided so a normal week's paper_title stays
          // trigger-derived from teacher_paper_id.
          ...(paperTitle !== undefined ? { paper_title: paperTitle } : {}),
        })
        .eq("id", id)
      if (error) throw new Error(paperErrorMessage(error))

      const { error: syncError } = await supabase.rpc(
        "meetings_sync_questioners",
        { p_meeting_id: id }
      )
      if (syncError) throw new Error(syncError.message || "同步提問人失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.paperAssignments.all })
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
      // Optional: pass it when appending inside a known semester group, so
      // the row can't drift to another semester (e.g. a date near a
      // month/semester boundary). Omit it when adding a meeting at an
      // arbitrary date with no group context — the meetings_set_semester
      // BEFORE INSERT trigger derives the right semester from
      // scheduled_date.
      semesterId?: string
      weekLabel: string | null
      scheduledDate: string
      isHoliday: boolean
      isSpeaker?: boolean
      isThesis?: boolean
      presenter: string | null
      presenterUserId: string | null
      paperTitle?: string | null
    }) => {
      // semester_id is NOT NULL with no column default (only
      // meetings_set_semester's BEFORE INSERT trigger fills it), so the
      // generated Insert type marks it required. Build the payload against a
      // locally-widened type so the key can be genuinely absent, then cast
      // back for `.insert()` — the trigger covers the omitted case.
      const payload: Omit<TablesInsert<"meetings">, "semester_id"> & {
        semester_id?: string
      } = {
        year: row.year,
        // Only sent when provided so the column is absent and the trigger
        // derives it — passing `undefined`/`null` explicitly would still
        // include the key and override the trigger's default.
        ...(row.semesterId !== undefined
          ? { semester_id: row.semesterId }
          : {}),
        week_label: row.weekLabel,
        scheduled_date: row.scheduledDate,
        is_holiday: row.isHoliday,
        is_speaker: row.isSpeaker ?? false,
        is_thesis: row.isThesis ?? false,
        presenter: row.presenter,
        presenter_user_id: row.presenterUserId,
        // The typed title lives in paper_title for a speaker or thesis week
        // (teacher_paper_id stays null, so the sync trigger normalizes and
        // keeps this value). Only sent when provided so a normal week's
        // paper_title is trigger-governed.
        ...(row.paperTitle !== undefined
          ? { paper_title: row.paperTitle }
          : {}),
      }

      const { data, error } = await supabase
        .from(TABLE)
        .insert(payload as TablesInsert<"meetings">)
        .select("id")
        .single()
      if (error) throw new Error(error.message || "新增失敗")

      const { error: syncError } = await supabase.rpc(
        "meetings_sync_questioners",
        { p_meeting_id: data.id }
      )
      if (syncError) throw new Error(syncError.message || "同步提問人失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.paperAssignments.all })
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
      qc.invalidateQueries({ queryKey: queryKeys.paperAssignments.all })
      toast.success("已刪除")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSwapMeetings() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ a, b }: { a: string; b: string }) => {
      const { error } = await supabase.rpc("meetings_swap", {
        p_a: a,
        p_b: b,
      })
      if (error) throw new Error(error.message || "互換失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.paperAssignments.all })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useInsertMeetingWeek() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (atMeetingId: string): Promise<string | null> => {
      const { data, error } = await supabase.rpc("meetings_insert_week", {
        p_at_meeting_id: atMeetingId,
      })
      if (error) throw new Error(error.message || "插入週次失敗")
      return data as string | null
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.paperAssignments.all })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/**
 * Appends one week to the END of a semester. Both values are computed by the
 * server: this hook deliberately sends nothing but the semester id.
 *
 * The client used to compute them, from `useMeetings(year)` — a YEAR-filtered
 * row set. A semester can span two `meetings.year` buckets (a 上學期 running
 * September→January does), so the browser saw a truncated slice of it, minted a
 * `第N週` the semester already used, and reported success. The RPC also enforces
 * the date-global "one meeting per calendar date" invariant that a plain
 * `.insert()` walked straight past (#1103).
 */
export function useAppendMeetingWeek() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (semesterId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("meetings_append_week", {
        p_semester_id: semesterId,
      })
      if (error) throw new Error(error.message || "新增週次失敗")
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.paperAssignments.all })
      toast.success("週次已新增")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRemoveMeetingWeek() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (atMeetingId: string) => {
      const { error } = await supabase.rpc("meetings_remove_week", {
        p_at_meeting_id: atMeetingId,
      })
      if (error) throw new Error(error.message || "刪除週次失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.paperAssignments.all })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

// A `type` (not `interface`) so it satisfies the generated RPC's `Json` arg —
// interfaces lack the implicit index signature that Json's object shape needs.
export type SemesterHoliday = {
  date: string
  label: string
}

/**
 * What `meetings_generate_semester` reports. The RPC skips a week for two
 * unrelated reasons and counts them separately; `skipped` (their sum) is still
 * in the jsonb payload for older readers, and is deliberately not surfaced here
 * — a caller that only sees the total cannot word the message correctly.
 */
export interface GenerateSemesterResult {
  inserted: number
  /** The date is already scheduled (the check is date-global, not per-semester). */
  skippedDate: number
  /** This semester already holds a 第N週 with that number. */
  skippedLabel: number
}

export function useGenerateSemester() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      year: number
      startDate: string
      weeks: number
      holidays: SemesterHoliday[]
    }): Promise<GenerateSemesterResult> => {
      const { data, error } = await supabase.rpc("meetings_generate_semester", {
        p_year: input.year,
        p_start_date: input.startDate,
        p_weeks: input.weeks,
        p_holidays: input.holidays,
      })
      if (error) throw new Error(error.message || "產生排班失敗")
      const raw = data as {
        inserted: number
        skipped_date: number
        skipped_label: number
      }
      return {
        inserted: raw.inserted,
        skippedDate: raw.skipped_date,
        skippedLabel: raw.skipped_label,
      }
    },
    onSuccess: ({ inserted, skippedDate, skippedLabel }) => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      qc.invalidateQueries({ queryKey: queryKeys.paperAssignments.all })
      // The two skip reasons mean opposite things and used to share one
      // sentence. "略過 16 週已存在" on a semester whose NUMBERS were taken (not
      // its dates) reads as "already scheduled, nothing to do" — and the admin
      // walks away from a schedule that was never created, which is the whole
      // point of the shifted-start-date case.
      const reasons: string[] = []
      if (skippedDate > 0) reasons.push(`${skippedDate} 週日期已排定`)
      if (skippedLabel > 0)
        reasons.push(`${skippedLabel} 週的週次編號已被此學期使用`)
      toast.success(
        reasons.length > 0
          ? `已產生 ${inserted} 週（略過：${reasons.join("、")}）`
          : `已產生 ${inserted} 週`
      )
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
