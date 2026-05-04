"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import {
  RECEIPT_FILE_EXT,
  RECEIPT_MIME_PDF,
  fileToReceiptPdf,
  sanitizeFilename,
} from "@/lib/receipts/file"
import {
  RECEIPTS_BUCKET,
  toReceipt,
  type DatabaseReceipt,
  type Receipt,
  type ReceiptStatus,
} from "@/lib/receipts/types"

import { queryKeys } from "./query-keys"

const TABLE = "receipts"
const SIGNED_URL_TTL = 60 * 60 // one hour — covers the time a tab stays open

export function useReceipts() {
  const supabase = createClient()
  return useQuery({
    queryKey: queryKeys.receipts.all,
    queryFn: async (): Promise<Receipt[]> => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false })
      if (error) {
        console.error("[receipts] list query failed", error)
        throw new Error(error.message || "讀取收據失敗")
      }
      return (data as DatabaseReceipt[]).map(toReceipt)
    },
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
    mutationFn: async ({ name, file }: { name: string; file: File }) => {
      const id = crypto.randomUUID()
      const path = `${id}/${id}.${RECEIPT_FILE_EXT}`
      const pdfBlob = await fileToReceiptPdf(file)

      const { error: uploadError } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(path, pdfBlob, {
          contentType: RECEIPT_MIME_PDF,
          upsert: false,
        })
      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .from(TABLE)
        .insert({ id, name, image_path: path })
        .select()
        .single()
      if (error) {
        // best-effort cleanup; orphan object beats half a row
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

export function useDownloadReceipt() {
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({ name, path }: { name: string; path: string }) => {
      const { data, error } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .download(path)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const a = document.createElement("a")
      a.href = url
      a.download = `${sanitizeFilename(name)}.${RECEIPT_FILE_EXT}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
  })
}
