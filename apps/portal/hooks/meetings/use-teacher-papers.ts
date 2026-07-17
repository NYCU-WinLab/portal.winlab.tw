"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import type { PaperAssignment } from "@/lib/meetings/papers"
import {
  toTag,
  toTeacherPaper,
  type DbTag,
  type DbTeacherPaper,
  type Tag,
  type TeacherPaper,
} from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

/**
 * Every meeting that currently holds a reading-list paper, across ALL years —
 * the cooldown window (365 days) crosses year boundaries, so availability can't
 * be computed from a single year's rows. Kept lean: only the columns the
 * cooldown / self-repeat rules need.
 */
export function usePaperAssignments() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.paperAssignments.all,
    queryFn: async (): Promise<PaperAssignment[]> => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, scheduled_date, presenter, presenter_user_id, teacher_paper_id")
        .not("teacher_paper_id", "is", null)
      if (error) throw new Error(error.message || "讀取 paper 認領狀態失敗")
      return (
        data as {
          id: string
          scheduled_date: string
          presenter: string | null
          presenter_user_id: string | null
          teacher_paper_id: string
        }[]
      ).map((r) => ({
        meetingId: r.id,
        scheduledDate: r.scheduled_date,
        presenter: r.presenter,
        presenterUserId: r.presenter_user_id,
        teacherPaperId: r.teacher_paper_id,
      }))
    },
  })
}

const TABLE = "teacher_papers"
const TAGS_TABLE = "meeting_tags"
const LINKS_TABLE = "teacher_paper_tags"

type PaperRow = DbTeacherPaper & {
  teacher_paper_tags: { meeting_tags: DbTag | null }[]
}

export function useTeacherPapers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.teacherPapers.all,
    queryFn: async (): Promise<TeacherPaper[]> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(
          "*, teacher_paper_tags(meeting_tags(id, name, color, created_at))"
        )
        .order("provided_date", { ascending: false })
      if (error) throw new Error(error.message || "讀取 papers 失敗")
      return (data as unknown as PaperRow[]).map((row) =>
        toTeacherPaper(
          row,
          row.teacher_paper_tags
            .map((link) => link.meeting_tags)
            .filter((t): t is DbTag => t !== null)
            .map(toTag)
        )
      )
    },
  })
}

export function useAddTeacherPaper() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (paper: {
      providedDate: string
      paperName: string
      fileLink: string | null
      source: string | null
      tagIds: string[]
    }) => {
      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          provided_date: paper.providedDate,
          paper_name: paper.paperName,
          file_link: paper.fileLink,
          source: paper.source,
        })
        .select("id")
        .single()
      if (error) throw new Error(error.message || "新增失敗")

      if (paper.tagIds.length > 0) {
        const { error: linkError } = await supabase.from(LINKS_TABLE).insert(
          paper.tagIds.map((tag_id) => ({
            teacher_paper_id: data.id,
            tag_id,
          }))
        )
        if (linkError) throw new Error(linkError.message || "標籤連結失敗")
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teacherPapers.all })
      toast.success("Paper 已新增")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteTeacherPaper() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE).delete().eq("id", id)
      if (error) throw new Error(error.message || "刪除失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teacherPapers.all })
      toast.success("已刪除")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useTags() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.tags.all,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from(TAGS_TABLE)
        .select("*")
        .order("name", { ascending: true })
      if (error) throw new Error(error.message || "讀取標籤失敗")
      return (data as DbTag[]).map(toTag)
    },
  })
}

export function useAddTag() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (tag: {
      name: string
      color: string | null
    }): Promise<string> => {
      const { data, error } = await supabase
        .from(TAGS_TABLE)
        .insert({ name: tag.name, color: tag.color })
        .select("id")
        .single()
      if (error) {
        if (error.code === "23505") throw new Error("已經有同名的標籤了")
        throw new Error(error.message || "新增標籤失敗")
      }
      return data.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags.all })
      toast.success("標籤已新增")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteTag() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      // teacher_paper_tags cascades, so this also unlinks the tag everywhere.
      const { error } = await supabase.from(TAGS_TABLE).delete().eq("id", id)
      if (error) throw new Error(error.message || "刪除標籤失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags.all })
      qc.invalidateQueries({ queryKey: queryKeys.teacherPapers.all })
      toast.success("標籤已刪除")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
