"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"
import {
  DOOR_COLOR_DEFAULT,
  DOOR_COLOR_PRESETS,
  parseDoorGreetingColor,
} from "@/lib/door/greeting-color"
import {
  DOOR_SUFFIX_DEFAULT,
  DOOR_SUFFIX_MAX_WIDTH,
  parseDoorGreetingSuffix,
  suffixWidth,
} from "@/lib/door/greeting-suffix"

import { saveDoorGreeting } from "../actions"
import { Section } from "./profile-ui"

export function DoorGreetingForm({
  name,
  suffix,
  color,
}: {
  // Already normalised the way the panel draws it.
  name: string
  suffix: string | null
  color: string | null
}) {
  const [saved, setSaved] = useState({ suffix, color })
  const [value, setValue] = useState(suffix ?? "")
  // Null is the panel default, distinct from picking white explicitly.
  const [colorValue, setColorValue] = useState<string | null>(color)
  const [pending, startTransition] = useTransition()

  const parsed = parseDoorGreetingSuffix(value)
  const parsedColor = parseDoorGreetingColor(colorValue)
  const width = suffixWidth(parsed.ok ? (parsed.value ?? "") : value.trim())
  const valid = parsed.ok && parsedColor.ok
  const dirty =
    !valid || parsed.value !== saved.suffix || parsedColor.value !== saved.color
  const shown = parsed.ok ? parsed.value : null
  // A too-dark pick still shows in the preview, so the member sees why.
  const selected = parsedColor.ok ? parsedColor.value : colorValue

  function save() {
    if (!valid || !dirty) return
    startTransition(async () => {
      const result = await saveDoorGreeting({
        suffix: value,
        color: colorValue,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setSaved({ suffix: result.suffix, color: result.color })
      setValue(result.suffix ?? "")
      setColorValue(result.color)
      toast.success("已更新門口看板。")
    })
  }

  return (
    <Section
      title="門口看板"
      description="刷卡或按 /door 開門時，門口 LED 看板顯示的內容。"
    >
      <form
        className="flex flex-col gap-4 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="door-greeting-suffix" className="text-xs">
            門口看板後綴
          </Label>
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
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="door-greeting-color" className="text-xs">
            名字顏色
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="door-greeting-color"
              type="color"
              value={selected ?? DOOR_COLOR_DEFAULT}
              onChange={(event) => setColorValue(event.target.value)}
              aria-invalid={!parsedColor.ok}
              aria-describedby="door-greeting-color-help"
              disabled={pending}
              className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
            />
            <div
              role="group"
              aria-label="常用顏色"
              className="flex flex-wrap items-center gap-1.5"
            >
              {DOOR_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  title={preset.value}
                  aria-label={`${preset.label} ${preset.value}`}
                  aria-pressed={selected === preset.value}
                  disabled={pending}
                  onClick={() => setColorValue(preset.value)}
                  style={{ backgroundColor: preset.value }}
                  className={cn(
                    "size-8 rounded-full border border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50",
                    selected === preset.value &&
                      "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                  )}
                />
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={selected === null}
              disabled={pending || selected === null}
              onClick={() => setColorValue(null)}
            >
              預設（白色）
            </Button>
          </div>
          <p
            id="door-greeting-color-help"
            className="text-xs text-muted-foreground"
          >
            只改名字那一行。太暗的顏色在 LED 上看不清楚，不能選。目前：
            <span className="font-mono">
              {selected ?? `${DOOR_COLOR_DEFAULT}（預設）`}
            </span>
          </p>
          {!parsedColor.ok ? (
            <p className="text-xs text-destructive">{parsedColor.error}</p>
          ) : null}
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={pending || !valid || !dirty}
          >
            {pending ? "儲存中…" : "儲存"}
          </Button>
        </div>
      </form>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="shrink-0 text-xs text-muted-foreground">預覽</span>
        <div
          aria-label="看板預覽"
          className="flex min-w-24 flex-col items-center rounded-md bg-black px-3 py-2 text-xs leading-snug text-white"
        >
          <span>歡迎</span>
          <span style={{ color: selected ?? DOOR_COLOR_DEFAULT }}>{name}</span>
          <span className={shown ? undefined : "text-white/60"}>
            {shown ?? DOOR_SUFFIX_DEFAULT}
          </span>
        </div>
      </div>
    </Section>
  )
}
