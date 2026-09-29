"use client"

import { useCallback, useState } from "react"

import { deleteDoorSound, saveDoorSound } from "@/app/profile/actions"
import {
  looksLikeDoorSound,
  SOUND_NOT_AUDIO,
  validateDoorSoundFile,
  type DoorSoundMode,
} from "@/lib/door/sound"
import {
  uploadDoorSound,
  type SaveDoorSoundResult,
} from "@/lib/profile/door-sound"
import { createClient } from "@/lib/supabase/client"

// Uploads go straight from the browser into the member's own folder (the
// storage INSERT policy allows nothing else), then the server action checks
// the stored object and points user_profiles at it.
export function useDoorSound(userId: string) {
  const [pending, setPending] = useState(false)

  const save = useCallback(
    async (file: File | null, mode: DoorSoundMode) => {
      setPending(true)
      try {
        if (!file) return await saveDoorSound({ mode })
        const check = validateDoorSoundFile(file)
        if (!check.ok) return check
        const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
        if (!looksLikeDoorSound(check.ext, head)) {
          return { ok: false, error: SOUND_NOT_AUDIO } as const
        }
        const upload = await uploadDoorSound(
          createClient(),
          userId,
          file,
          check
        )
        if (!upload.ok) return upload
        return await saveDoorSound({ path: upload.path, mode })
      } catch (err) {
        console.error("[profile] door sound save failed", err)
        return { ok: false, error: "儲存失敗，請重試。" } as const
      } finally {
        setPending(false)
      }
    },
    [userId]
  )

  const remove = useCallback(async (): Promise<SaveDoorSoundResult> => {
    setPending(true)
    try {
      return await deleteDoorSound()
    } catch (err) {
      console.error("[profile] door sound delete failed", err)
      return { ok: false, error: "刪除失敗，請重試。" }
    } finally {
      setPending(false)
    }
  }, [])

  return { save, remove, pending }
}
