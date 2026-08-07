"use client"

import { useCallback, useState } from "react"

import { finalizePdfUpload } from "@/app/approve/actions"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"
import { validatePdfFile } from "@/lib/approve/upload"
import { createClient } from "@/lib/supabase/client"

export function usePdfUpload(documentId: string) {
  const [uploading, setUploading] = useState(false)

  const upload = useCallback(
    async (file: File) => {
      const validation = validatePdfFile(file)
      if (!validation.ok) throw new Error(validation.error)

      setUploading(true)
      try {
        const path = documentStoragePath(documentId)
        const supabase = createClient()
        const bucket = supabase.storage.from(APPROVE_BUCKET)

        // Storage has INSERT + DELETE policies but no UPDATE policy. Clearing
        // a stale object first keeps retries working without an upsert.
        const { error: removeError } = await bucket.remove([path])
        if (removeError) throw new Error(removeError.message)

        const { error } = await bucket.upload(path, file, {
          contentType: "application/pdf",
        })
        if (error) throw new Error(error.message)

        await finalizePdfUpload(documentId)
        return path
      } finally {
        setUploading(false)
      }
    },
    [documentId]
  )

  return { upload, uploading }
}
