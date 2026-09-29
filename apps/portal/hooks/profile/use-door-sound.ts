"use client"

import { useCallback, useState } from "react"

import { deleteDoorSound, saveDoorSound } from "@/app/profile/actions"
import type { DoorSoundMode } from "@/lib/door/sound"
import {
  saveDoorSoundFile,
  type SaveDoorSoundResult,
} from "@/lib/profile/door-sound"
import { createClient } from "@/lib/supabase/client"

// Uploads go straight from the browser into the member's own folder (the
// storage INSERT policy allows nothing else), then the server action checks
// the stored object and points user_profiles at it. The steps live in
// saveDoorSoundFile, so they are tested without React.
export function useDoorSound(userId: string) {
  const [pending, setPending] = useState(false)

  const save = useCallback(
    async (file: File | null, mode: DoorSoundMode) => {
      setPending(true)
      try {
        return await saveDoorSoundFile(
          createClient(),
          userId,
          { file, mode },
          saveDoorSound
        )
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
