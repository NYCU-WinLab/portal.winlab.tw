"use client"

import { useCallback, useState } from "react"

import { createDefaultSound } from "@/app/door/admin/sound-actions"
import {
  DEFAULT_SOUND_FAILED,
  uploadDefaultSoundFile,
  type DefaultSoundMutation,
} from "@/lib/door/default-sound-admin"
import { createClient } from "@/lib/supabase/client"

// The file goes straight from the browser into defaults/ (the storage INSERT
// policy allows that only for door admins), then the server action checks the
// stored object and adds the row.
export function useDefaultSoundUpload() {
  const [pending, setPending] = useState(false)

  const upload = useCallback(
    async (file: File, label: string): Promise<DefaultSoundMutation> => {
      setPending(true)
      try {
        const stored = await uploadDefaultSoundFile(createClient(), file)
        if (!stored.ok) return stored
        return await createDefaultSound({ path: stored.path, label })
      } catch (err) {
        console.error("[door] default sound upload failed", err)
        return { ok: false, error: DEFAULT_SOUND_FAILED }
      } finally {
        setPending(false)
      }
    },
    []
  )

  return { upload, pending }
}
