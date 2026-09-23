"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  DOOR_SUFFIX_DEFAULT,
  DOOR_SUFFIX_MAX_WIDTH,
  parseDoorGreetingSuffix,
  suffixWidth,
} from "@/lib/door/greeting-suffix"

import { saveDoorGreetingSuffix } from "../actions"
import { Section } from "./profile-ui"

export function DoorGreetingForm({
  name,
  suffix,
}: {
  // Already normalised the way the panel draws it.
  name: string
  suffix: string | null
}) {
  const [saved, setSaved] = useState(suffix)
  const [value, setValue] = useState(suffix ?? "")
  const [pending, startTransition] = useTransition()

  const parsed = parseDoorGreetingSuffix(value)
  const width = suffixWidth(parsed.ok ? (parsed.value ?? "") : value.trim())
  const dirty = !parsed.ok || parsed.value !== saved
  const shown = parsed.ok ? parsed.value : null

  function save() {
    if (!parsed.ok || !dirty) return
    startTransition(async () => {
      const result = await saveDoorGreetingSuffix(value)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setSaved(result.suffix)
      setValue(result.suffix ?? "")
      toast.success(result.suffix ? "已更新看板後綴。" : "已改回預設後綴。")
    })
  }

  return (
    <Section
      title="門口看板"
      description="刷卡或按 /door 開門時，門口 LED 看板顯示的內容。"
    >
      <form
        className="flex flex-col gap-2 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <Label htmlFor="door-greeting-suffix" className="text-xs">
          門口看板後綴
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="door-greeting-suffix"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={DOOR_SUFFIX_DEFAULT}
            autoComplete="off"
            aria-invalid={!parsed.ok}
            aria-describedby="door-greeting-suffix-help door-greeting-suffix-count"
            disabled={pending}
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || !parsed.ok || !dirty}
          >
            {pending ? "儲存中…" : "儲存"}
          </Button>
        </div>
        <div className="flex items-start justify-between gap-4 text-xs">
          <p id="door-greeting-suffix-help" className="text-muted-foreground">
            開門時顯示在名字下方，最多 3 個中文字或 6 個英數字，留空用預設「
            {DOOR_SUFFIX_DEFAULT}」
          </p>
          <span
            id="door-greeting-suffix-count"
            aria-live="polite"
            className={
              "shrink-0 font-mono tabular-nums " +
              (width > DOOR_SUFFIX_MAX_WIDTH
                ? "text-destructive"
                : "text-muted-foreground")
            }
          >
            {width}/{DOOR_SUFFIX_MAX_WIDTH}
          </span>
        </div>
        {!parsed.ok ? (
          <p className="text-xs text-destructive">{parsed.error}</p>
        ) : null}
      </form>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="shrink-0 text-xs text-muted-foreground">預覽</span>
        <div
          aria-label="看板預覽"
          className="flex min-w-24 flex-col items-center rounded-md bg-muted px-3 py-2 text-xs leading-snug"
        >
          <span>歡迎</span>
          <span>{name}</span>
          <span className={shown ? undefined : "text-muted-foreground"}>
            {shown ?? DOOR_SUFFIX_DEFAULT}
          </span>
        </div>
      </div>
    </Section>
  )
}
