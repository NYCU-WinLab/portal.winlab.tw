"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

import {
  RECEIPTS_BUCKET,
  toReceipt,
  type DatabaseReceipt,
  type Receipt,
  type ReceiptStatus,
} from "@/lib/receipts/types"

import { queryKeys } from "./query-keys"

const TABLE = "receipts"
const SIGNED_URL_TTL = 60 * 60 // one hour — long enough that a tab open all
// afternoon doesn't go stale

export function useReceipts() {
  const supabase = createClient()
  return useQuery({
    queryKey: queryKeys.receipts.all,
    queryFn: async (): Promise<Receipt[]> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      return (data as DatabaseReceipt[]).map(toReceipt)
    },
  })
}

export function useReceiptSignedUrl(path: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: path ? queryKeys.signedUrl(path) : ["receipts", "signed-url", ""],
    queryFn: async () => {
      if (!path) return null
      const { data, error } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL)
      if (error) throw error
      return data.signedUrl
    },
    enabled: !!path,
    staleTime: (SIGNED_URL_TTL - 60) * 1000,
  })
}

export function useUploadReceipt() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, file }: { name: string; file: File }) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin"
      const id = crypto.randomUUID()
      const path = `${id}/${id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .from(TABLE)
        .insert({ id, name, image_path: path })
        .select()
        .single()
      if (error) {
        // best-effort cleanup; orphaned object is preferable to a half-row
        await supabase.storage.from(RECEIPTS_BUCKET).remove([path])
        throw error
      }
      return toReceipt(data as DatabaseReceipt)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.receipts.all })
    },
  })
}

export function useUpdateReceiptStatus() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: ReceiptStatus
    }) => {
      const { data, error } = await supabase
        .from(TABLE)
        .update({ status })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return toReceipt(data as DatabaseReceipt)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.receipts.all })
    },
  })
}
