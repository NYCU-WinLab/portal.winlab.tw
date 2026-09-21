"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { triggerReceiptEmailDrain } from "@/app/receipts/actions"
import { fetchReceipts } from "@/lib/receipts/fetch"
import { createClient } from "@/lib/supabase/client"
import { fileToReceiptPdf } from "@/lib/receipts/file"
import {
  RECEIPTS_BUCKET,
  toReceipt,
  type DatabaseReceiptWithTags,
  type DepositAccount,
  type ReceiptStatus,
} from "@/lib/receipts/types"
import { uploadReceiptPdf } from "@/lib/receipts/upload"

import { queryKeys } from "./query-keys"

const TABLE = "receipts"
const SIGNED_URL_TTL = 60 * 60 // one hour — covers the time a tab stays open

export function useReceipts() {
  const supabase = createClient()
  return useQuery({
    queryKey: queryKeys.receipts.all,
    queryFn: () => fetchReceipts(supabase),
    retry: 2,
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
    mutationFn: async ({
      name,
      file,
      depositAccount,
    }: {
      name: string
      file: File
      depositAccount: DepositAccount
    }) => {
      const pdf = await fileToReceiptPdf(file)
      const receipt = await uploadReceiptPdf(supabase, {
        name,
        depositAccount,
        pdf,
      })

      // Fire-and-forget — the server action defers the actual drain to
      // `after()` so this await only costs one round-trip to kick it off.
      // A notification failure must not surface as an upload failure.
      try {
        await triggerReceiptEmailDrain()
      } catch (err) {
        console.warn(
          "[receipts] notify trigger failed (upload still succeeded)",
          err
        )
      }

      return receipt
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.receipts.all })
    },
  })
}

export function useUpdateReceipt() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      name,
      depositAccount,
    }: {
      id: string
      name: string
      depositAccount: DepositAccount
    }) => {
      const trimmed = name.trim()
      if (!trimmed) throw new Error("名稱不能空白")
      const { data, error } = await supabase
        .from(TABLE)
        .update({ name: trimmed, deposit_account: depositAccount })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return toReceipt(data as unknown as DatabaseReceiptWithTags)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.receipts.all })
    },
  })
}

export function useDeleteReceipt() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, path }: { id: string; path: string }) => {
      // Drop the row first — storage cleanup is best-effort because an orphan
      // PDF beats a half-deleted record (RLS blocks reads anyway once the row
      // is gone, so the orphan stays invisible to users).
      const { error } = await supabase.from(TABLE).delete().eq("id", id)
      if (error) throw error
      await supabase.storage.from(RECEIPTS_BUCKET).remove([path])
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
      return toReceipt(data as unknown as DatabaseReceiptWithTags)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.receipts.all })
    },
  })
}
