"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type { TablesInsert } from "@/lib/supabase/database.types"
import { toMeeting, type DbMeeting, type Meeting } from "@/lib/meetings/types"
import type { SemesterKey } from "@/lib/meetings/semester"

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

// meetings_scheduled_date_uniq (see 20260828160000_meetings-one-per-date.sql)
// is what the RPCs' own occupied-date check never covered: a direct INSERT
// that skips every RPC (add-meeting dialog, empty-year "first week" button).
// A raw "duplicate key value violates unique constraint …" toast isn't
// something an admin can act on, so translate that one violation like
// paperErrorMessage does for the paper rules above.
function addMeetingErrorMessage(error: {
  code?: string
  message?: string
}): string {
  const msg = error.message ?? ""
  if (error.code === "23505" && msg.includes("meetings_scheduled_date_uniq")) {
    return "該日期已有會議"
  }
  return msg || "新增失敗"
}

export function useMeetings(year: number) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.meetings.byYear(year),
    queryFn: async (): Promise<Meeting[]> => {
      // 頁籤是西元年，過濾就用西元年的日期區間。以前這裡讀的是 meetings.year
      // 欄位——一份在列被搬動時不會跟著更新的狀態，於是跨年搬過去的人會留在
      // 舊的頁籤上。日期是列上唯一會被編輯的東西，所以用它。
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .gte("scheduled_date", `${year}-01-01`)
        .lte("scheduled_date", `${year}-12-31`)
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

/**
 * 在**任意**日期新增一場會議——頁面層的新增對話框，以及空年份的第一週。
 *
 * 與 `useAppendMeetingWeek` 的差別現在只剩「誰決定日期」：這裡是人挑的，
 * 那裡是伺服器從學期的最後一列算出來的。兩者都不再需要煩惱學期歸屬——
 * 日期落在哪個學期，它就屬於哪個學期。
 */
export function useAddMeeting() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (row: {
      weekLabel: string | null
      scheduledDate: string
      isHoliday: boolean
      isSpeaker?: boolean
      isThesis?: boolean
      presenter: string | null
      presenterUserId: string | null
      paperTitle?: string | null
    }) => {
      const payload: TablesInsert<"meetings"> = {
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
        .insert(payload)
        .select("id")
        .single()
      if (error) throw new Error(addMeetingErrorMessage(error))

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
 * 在某個學期的最後面追加一週。日期與標籤都由伺服器算，這個 hook 只送學期。
 *
 * 學期不再是一列資料，所以參數是 (學年度, 學期) 這對值——就是
 * `semesterKeyForDate()` 回傳的東西。伺服器從整個學期的日期窗算，而不是從
 * 呼叫端剛好看得到的那一段：一個學期會橫跨兩個年份頁籤。
 */
export function useAppendMeetingWeek() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (key: SemesterKey): Promise<string> => {
      const { data, error } = await supabase.rpc("meetings_append_week", {
        p_academic_year: key.academicYear,
        p_term: key.term,
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
      startDate: string
      weeks: number
      holidays: SemesterHoliday[]
    }): Promise<GenerateSemesterResult> => {
      const { data, error } = await supabase.rpc("meetings_generate_semester", {
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
