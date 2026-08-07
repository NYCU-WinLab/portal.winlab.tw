"use client"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { formatPrefix } from "@/lib/rooms/meeting-topic"

/**
 * The meeting title, as a fixed prefix plus the part a person types.
 *
 * The prefix is rendered as an adornment rather than as text inside the box
 * on purpose: Teams names the recording file after the topic, and that
 * filename is what later sorts recordings into NextCloud. Showing it keeps
 * people from being surprised by it; not letting them edit it is what keeps
 * one group's recordings from filing themselves under another's.
 */
export function TopicField({
  id,
  prefix,
  suffix,
  onSuffixChange,
}: {
  id: string
  /** Null until a group is picked or an attendee with a username is added. */
  prefix: string | null
  suffix: string
  onSuffixChange: (next: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        會議標題
      </Label>
      <div className="flex items-center gap-1.5">
        {prefix && (
          <span
            className="shrink-0 rounded-md border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
            title="依與會群組自動產生,無法修改。這段會成為 Teams 錄影檔名的前綴。"
          >
            {formatPrefix(prefix)}
          </span>
        )}
        <Input
          id={id}
          value={suffix}
          onChange={(e) => onSuffixChange(e.target.value)}
          placeholder="meeting"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {prefix
          ? "前綴依與會群組自動產生,無法修改 —— 它決定這場會議的錄影檔歸在哪個專案底下。"
          : "選擇與會群組或人員後,標題會自動加上專案前綴。"}
      </p>
    </div>
  )
}
