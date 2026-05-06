"use client"

import { Search } from "lucide-react"

import { Input } from "@workspace/ui/components/input"

export function ReceiptsSearchBar({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="relative">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="搜尋名稱、狀態或標籤…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  )
}
