"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"
import { useDoorSound } from "@/hooks/profile/use-door-sound"
import {
  DOOR_SOUND_ACCEPT,
  DOOR_SOUND_MAX_SECONDS,
  DOOR_SOUND_MODE_LABELS,
  DOOR_SOUND_MODES,
  doorSoundOutcome,
  validateDoorSoundFile,
  type DoorSoundMode,
} from "@/lib/door/sound"

import { Section } from "./profile-ui"

export function DoorSoundForm({
  userId,
  path,
  mode,
  url,
}: {
  userId: string
  path: string | null
  mode: DoorSoundMode
  // Signed server-side for the player; null when there is no file or it
  // could not be signed.
  url: string | null
}) {
  const { save, remove, pending } = useDoorSound(userId)
  const [saved, setSaved] = useState({ path, mode })
  const [modeValue, setModeValue] = useState<DoorSoundMode>(mode)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  // pickedUrl plays the file picked but not saved yet; savedUrl the saved
  // one, signed by the server or, right after a save, the same local file.
  const [pickedUrl, setPickedUrl] = useState<string | null>(null)
  const [savedUrl, setSavedUrl] = useState<string | null>(url)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const objectUrls = useRef<string[]>([])

  useEffect(() => {
    const urls = objectUrls.current
    return () => urls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
  }, [])

  const hasFile = Boolean(file || saved.path)
  const dirty = file !== null || modeValue !== saved.mode
  const playerUrl = pickedUrl ?? savedUrl
  const outcome = doorSoundOutcome({ mode: modeValue, hasFile })

  function resetPicker() {
    setFile(null)
    setPickedUrl(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  function pick(next: File | null) {
    setFileError(null)
    const check = next ? validateDoorSoundFile(next) : null
    if (!next || !check?.ok) {
      if (check && !check.ok) setFileError(check.error)
      resetPicker()
      if (!saved.path) setModeValue("voice_only")
      return
    }
    const objectUrl = URL.createObjectURL(next)
    objectUrls.current.push(objectUrl)
    setFile(next)
    setPickedUrl(objectUrl)
    // A first upload with the default-sound mode would change nothing.
    if (modeValue === "voice_only") setModeValue("sound_only")
  }

  async function submit() {
    if (!dirty || pending) return
    const result = await save(file, modeValue)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setSaved({ path: result.path, mode: result.mode })
    setModeValue(result.mode)
    if (file) {
      // The old signed URL points at a file that is being removed; the new
      // one keeps playing from memory.
      setSavedUrl(pickedUrl)
      resetPicker()
    }
    toast.success("已更新開門音效。")
  }

  async function confirmDelete() {
    const result = await remove()
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setConfirmOpen(false)
    setSaved({ path: null, mode: "voice_only" })
    setModeValue("voice_only")
    setSavedUrl(null)
    resetPicker()
    toast.success("已刪除開門音效。")
  }

  return (
    <Section
      title="開門音效"
      description="刷卡或按 /door 開門時門口喇叭播的音效。有上傳音效就播你的音效，否則播實驗室預設音效。門口看板的後綴只改 LED 上的字，不影響聲音。"
    >
      <form
        className="flex flex-col gap-4 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="door-sound-file" className="text-xs">
            音檔
          </Label>
          <Input
            ref={inputRef}
            id="door-sound-file"
            type="file"
            accept={DOOR_SOUND_ACCEPT}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
            aria-invalid={fileError !== null}
            aria-describedby="door-sound-file-help"
            disabled={pending}
          />
          <p
            id="door-sound-file-help"
            className="text-xs text-muted-foreground"
          >
            mp3、m4a、aac、wav、ogg，3 MB 以內。超過 {DOOR_SOUND_MAX_SECONDS}{" "}
            秒會被截掉，音量會自動調成一致。
          </p>
          {fileError ? (
            <p className="text-xs text-destructive">{fileError}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">試聽</span>
          {playerUrl ? (
            <audio
              key={playerUrl}
              controls
              preload="metadata"
              src={playerUrl}
              className="h-9 w-full"
              aria-label="開門音效試聽"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {saved.path ? "目前無法載入試聽，稍後再試。" : "尚未上傳音效。"}
            </p>
          )}
          {file ? (
            <p className="text-xs text-muted-foreground">
              已選擇「{file.name}」，按儲存後才會換上。
            </p>
          ) : null}
        </div>

        <fieldset className="flex flex-col gap-2" disabled={pending}>
          <legend className="mb-2 text-xs font-medium">播放方式</legend>
          {DOOR_SOUND_MODES.map((option) => {
            const needsFile = option !== "voice_only"
            const disabled = needsFile && !hasFile
            return (
              <label
                key={option}
                className={cn(
                  "flex items-center gap-2 text-xs",
                  disabled && "cursor-not-allowed text-muted-foreground/60"
                )}
              >
                <input
                  type="radio"
                  name="door-sound-mode"
                  value={option}
                  checked={modeValue === option}
                  disabled={disabled}
                  onChange={() => setModeValue(option)}
                  className="accent-foreground"
                />
                {DOOR_SOUND_MODE_LABELS[option]}
              </label>
            )
          })}
          {!hasFile ? (
            <p className="text-xs text-muted-foreground">
              上傳音效後才能選「播我的音效」。
            </p>
          ) : null}
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {outcome === "own"
              ? "開門時會播你的音效。"
              : "開門時會播實驗室預設音效。"}
          </p>
        </fieldset>

        <div className="flex justify-end gap-2">
          {saved.path ? (
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                >
                  刪除音效
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>刪除開門音效？</AlertDialogTitle>
                  <AlertDialogDescription>
                    刪除後會播預設音效。要用自己的音效得重新上傳。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
                  <AlertDialogAction
                    type="button"
                    variant="destructive"
                    disabled={pending}
                    onClick={(event) => {
                      event.preventDefault()
                      void confirmDelete()
                    }}
                  >
                    {pending ? "刪除中…" : "刪除"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <Button type="submit" size="sm" disabled={pending || !dirty}>
            {pending ? "儲存中…" : "儲存"}
          </Button>
        </div>
      </form>
    </Section>
  )
}
