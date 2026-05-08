"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import {
  toTag,
  type DatabaseTag,
  type Tag,
  type TagVariant,
} from "@/lib/receipts/types"

import { queryKeys } from "./query-keys"

const TAGS_TABLE = "receipt_tags"
const ASSIGNMENTS_TABLE = "receipt_tag_assignments"

export function useTags() {
  const supabase = createClient()
  return useQuery({
    queryKey: queryKeys.tags.all,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from(TAGS_TABLE)
        .select("*")
        .order("name", { ascending: true })
      if (error) {
        console.error("[receipts] tag list query failed", error)
        throw new Error(error.message || "讀取標籤失敗")
      }
      return (data as DatabaseTag[]).map(toTag)
    },
    retry: 2,
  })
}

export function useCreateTag() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      variant = "secondary",
    }: {
      name: string
      variant?: TagVariant
    }) => {
      const trimmed = name.trim()
      if (!trimmed) throw new Error("標籤名稱不能空白")
      const { data, error } = await supabase
        .from(TAGS_TABLE)
        .insert({ name: trimmed, variant })
        .select()
        .single()
      if (error) {
        // 23505 = unique_violation; PostgREST surfaces it as "duplicate key…"
        if (error.code === "23505") throw new Error(`「${trimmed}」已存在`)
        throw error
      }
      return toTag(data as DatabaseTag)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags.all })
    },
  })
}

export function useDeleteTag() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from(TAGS_TABLE).delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.tags.all })
      // assignments cascade-delete on the DB side; refetch receipts to drop
      // the tag from any cards still showing it.
      qc.invalidateQueries({ queryKey: queryKeys.receipts.all })
    },
  })
}

// Toggle whether a tag is attached to a receipt. We pass `attached` (current
// state) so the mutation knows whether to insert or delete — saves a roundtrip
// vs. checking server-side.
export function useToggleTag() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      receiptId,
      tagId,
      attached,
    }: {
      receiptId: string
      tagId: string
      attached: boolean
    }) => {
      if (attached) {
        const { error } = await supabase
          .from(ASSIGNMENTS_TABLE)
          .delete()
          .eq("receipt_id", receiptId)
          .eq("tag_id", tagId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from(ASSIGNMENTS_TABLE)
          .insert({ receipt_id: receiptId, tag_id: tagId })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.receipts.all })
    },
  })
}
