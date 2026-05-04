"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import {
  toTeacherPaper,
  type DbTeacherPaper,
  type TeacherPaper,
} from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

const TABLE = "teacher_papers"

export function useTeacherPapers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.teacherPapers.all,
    queryFn: async (): Promise<TeacherPaper[]> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("provided_date", { ascending: false })
      if (error) throw new Error(error.message || "讀取 papers 失敗")
      return (data as DbTeacherPaper[]).map(toTeacherPaper)
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
    }) => {
      const { error } = await supabase.from(TABLE).insert({
        provided_date: paper.providedDate,
        paper_name: paper.paperName,
        file_link: paper.fileLink,
        source: paper.source,
      })
      if (error) throw new Error(error.message || "新增失敗")
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
