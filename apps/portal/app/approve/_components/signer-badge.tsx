"use client"

import { useMemo, useState } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import type { SignerProfile } from "@/lib/approve/types"

// 8-colour tailwind palette (red-500 → pink-500). signer_id hash → index.
const PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
] as const
const UNASSIGNED_COLOR = "#9ca3af" // neutral-400

export function signerColor(signerId: string | null): string {
  if (!signerId) return UNASSIGNED_COLOR
  let hash = 0
  for (let i = 0; i < signerId.length; i++) {
    hash = (hash * 31 + signerId.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}

export function SignerBadge({
  label,
  candidates,
  currentId,
  onChange,
}: {
  label: string
  candidates: SignerProfile[]
  currentId: string | null
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const current = useMemo(
    () =>
      currentId ? (candidates.find((c) => c.id === currentId) ?? null) : null,
    [candidates, currentId]
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="no-drag rounded bg-background/80 px-1.5 py-0.5 text-[10px] hover:bg-background"
        >
          {label} · {current?.name ?? "選 signer"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0">
        <Command>
          <CommandInput placeholder="搜尋成員..." />
          <CommandList>
            <CommandEmpty>沒有符合</CommandEmpty>
            <CommandGroup>
              {candidates.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.email ?? ""}`}
                  onSelect={() => {
                    onChange(c.id)
                    setOpen(false)
                  }}
                >
                  <Avatar className="size-5">
                    <AvatarImage src={c.avatar_url ?? undefined} />
                    <AvatarFallback>{c.name.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{c.name}</span>
                    {c.email && (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {c.email}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
