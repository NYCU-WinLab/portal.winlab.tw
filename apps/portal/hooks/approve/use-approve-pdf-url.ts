"use client"

import { useCallback, useEffect, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import { APPROVE_BUCKET, documentStoragePath } from "@/lib/approve/storage"

// Centralised signed-URL generator. 30-min TTL — caller can trigger refresh()
// on <Document onLoadError> if a user sits on the page past expiry.
export function useApprovePdfUrl(documentId: string, filePath: string | null) {
  const [url, setUrl] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!filePath) {
      setUrl(null)
      return
    }
    const supabase = createClient()
    supabase.storage
      .from(APPROVE_BUCKET)
      .createSignedUrl(documentStoragePath(documentId), 60 * 30)
      .then(({ data, error }) => {
        if (error) {
          console.error("[approve] createSignedUrl failed", error)
          return
        }
        setUrl(data?.signedUrl ?? null)
      })
  }, [documentId, filePath])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { url, refresh }
}
