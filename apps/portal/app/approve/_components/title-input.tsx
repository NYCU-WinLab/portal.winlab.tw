"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Input } from "@workspace/ui/components/input"

import { updateDocumentTitle } from "../actions"
import { SaveIndicator, type SaveStatus } from "./save-indicator"

export function TitleInput({
  documentId,
  initial,
}: {
  documentId: string
  initial: string
}) {
  const [value, setValue] = useState(initial)
  const [status, setStatus] = useState<SaveStatus>("idle")
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const t = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (t.current) clearTimeout(t.current)
    }
  }, [])

  function onChange(next: string) {
    setValue(next)
    setStatus("saving")
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(async () => {
      try {
        await updateDocumentTitle(documentId, next.trim() || "未命名")
        setStatus("saved")
        setSavedAt(new Date())
      } catch (e) {
        toast.error((e as Error).message)
        setStatus("error")
      }
    }, 500)
  }

  return (
    <div className="flex items-center gap-3">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="標題"
        className="max-w-xs"
      />
      <SaveIndicator status={status} at={savedAt} />
    </div>
  )
}
