"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
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
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"

import { useDefaultSoundUpload } from "@/hooks/door/use-default-sound-upload"
import type {
  DefaultSoundMutation,
  DefaultSoundView,
} from "@/lib/door/default-sound-admin"
import {
  DEFAULT_SOUND_LABEL_MAX,
  normalizeDefaultSoundLabel,
} from "@/lib/door/default-sounds"
import {
  DOOR_SOUND_ACCEPT,
  DOOR_SOUND_MAX_SECONDS,
  validateDoorSoundFile,
} from "@/lib/door/sound"

import {
  removeDefaultSound,
  renameDefaultSound,
  setDefaultSoundEnabled,
} from "../sound-actions"

export function DefaultSounds({
  sounds,
  loadError,
}: {
  sounds: DefaultSoundView[]
  loadError: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [deleting, setDeleting] = useState<DefaultSoundView | null>(null)
  const inRotation = sounds.filter((sound) => sound.enabled).length

  function run(
    action: () => Promise<DefaultSoundMutation>,
    onDone?: () => void
  ) {
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        toast.success(result.message)
        onDone?.()
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">預設開門音效</h2>
          <Badge variant="outline" className="tabular-nums">
            輪播中 {inRotation} / {sounds.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          沒有自己音效的成員開門時，從輪播中的音效隨機挑一首。沒有任何音效在輪播時，播門口面板內建的音效。
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">載入失敗：{loadError}</p>
      ) : (
        <>
          <AddDefaultSound onAdded={() => router.refresh()} />

          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {sounds.length === 0 ? (
              <li className="py-10 text-center text-sm text-muted-foreground">
                尚無預設音效
              </li>
            ) : (
              sounds.map((sound) => (
                <DefaultSoundItem
                  key={sound.id}
                  sound={sound}
                  pending={pending}
                  onRename={(label) =>
                    run(() => renameDefaultSound(sound.id, label))
                  }
                  onToggle={(enabled) =>
                    run(() => setDefaultSoundEnabled(sound.id, enabled))
                  }
                  onDelete={() => setDeleting(sound)}
                />
              ))
            )}
          </ul>
        </>
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除「{deleting?.label}」？</AlertDialogTitle>
            <AlertDialogDescription>
              音檔會一併刪除。只想暫時不播的話，把它移出輪播就好。
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
                const target = deleting
                if (target) {
                  run(
                    () => removeDefaultSound(target.id),
                    () => setDeleting(null)
                  )
                }
              }}
            >
              {pending ? "刪除中…" : "刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function AddDefaultSound({ onAdded }: { onAdded: () => void }) {
  const { upload, pending } = useDefaultSoundUpload()
  const [label, setLabel] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function pick(next: File | null) {
    setError(null)
    const check = next ? validateDoorSoundFile(next) : null
    if (!next || !check?.ok) {
      if (check && !check.ok) setError(check.error)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    setFile(next)
    // The file name is a fair first guess at a name for it.
    if (!label.trim()) {
      setLabel(
        next.name.replace(/\.[^.]+$/, "").slice(0, DEFAULT_SOUND_LABEL_MAX)
      )
    }
  }

  async function submit() {
    if (!file || pending) return
    // Checked before uploading, so a bad name never leaves a file behind.
    const checked = normalizeDefaultSoundLabel(label)
    if (!checked.ok) {
      setError(checked.error)
      return
    }
    const result = await upload(file, checked.label)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(result.message)
    setLabel("")
    setFile(null)
    if (inputRef.current) inputRef.current.value = ""
    onAdded()
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:flex-wrap sm:items-end"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="default-sound-file" className="text-xs">
          音檔
        </Label>
        <Input
          ref={inputRef}
          id="default-sound-file"
          type="file"
          accept={DOOR_SOUND_ACCEPT}
          onChange={(event) => pick(event.target.files?.[0] ?? null)}
          aria-invalid={error !== null}
          aria-describedby="default-sound-help"
          disabled={pending}
        />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="default-sound-label" className="text-xs">
          名稱
        </Label>
        <Input
          id="default-sound-label"
          value={label}
          maxLength={DEFAULT_SOUND_LABEL_MAX}
          onChange={(event) => setLabel(event.target.value)}
          disabled={pending}
        />
      </div>
      <Button type="submit" size="sm" disabled={!file || pending}>
        {pending ? "上傳中…" : "加入輪播"}
      </Button>
      <p
        id="default-sound-help"
        className="w-full text-xs text-muted-foreground"
      >
        mp3、m4a、aac、wav、ogg，3 MB 以內（wav 檔大，約 18 秒就到上限）。
        門口面板只播前 {DOOR_SOUND_MAX_SECONDS} 秒。
      </p>
      {error ? (
        <p className="w-full text-xs text-destructive">{error}</p>
      ) : null}
    </form>
  )
}

function DefaultSoundItem({
  sound,
  pending,
  onRename,
  onToggle,
  onDelete,
}: {
  sound: DefaultSoundView
  pending: boolean
  onRename: (label: string) => void
  onToggle: (enabled: boolean) => void
  onDelete: () => void
}) {
  const [label, setLabel] = useState(sound.label)
  const dirty = label.trim() !== sound.label

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (dirty) onRename(label)
          }}
        >
          <Input
            aria-label="音效名稱"
            value={label}
            maxLength={DEFAULT_SOUND_LABEL_MAX}
            onChange={(event) => setLabel(event.target.value)}
            disabled={pending}
            className="h-8"
          />
          {dirty ? (
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={pending}
            >
              改名
            </Button>
          ) : null}
        </form>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={sound.enabled}
            onCheckedChange={onToggle}
            disabled={pending}
            aria-label={`${sound.label} 是否在輪播中`}
          />
          {sound.enabled ? "輪播中" : "未輪播"}
        </label>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onDelete}
          className="text-destructive"
        >
          刪除
        </Button>
      </div>
      {sound.url ? (
        <audio
          controls
          preload="none"
          src={sound.url}
          className="h-9 w-full"
          aria-label={`${sound.label} 試聽`}
        />
      ) : (
        <p className="text-xs text-muted-foreground">目前無法載入試聽。</p>
      )}
    </li>
  )
}
