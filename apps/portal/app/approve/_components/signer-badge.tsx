"use client"

import { useMemo } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Button } from "@workspace/ui/components/button"

import type { SignerProfile } from "@/lib/approve/types"

// Pick a deterministic hue per signer id so the same person always gets
// the same colour across sessions and devices.
export function signerColor(signerId: string): string {
  let hash = 0
  for (let i = 0; i < signerId.length; i++) {
    hash = (hash * 31 + signerId.charCodeAt(i)) | 0
  }
  return `hsl(${((hash % 360) + 360) % 360} 75% 45%)`
}

export function SignerBadge({
  signers,
  currentId,
  onChange,
}: {
  signers: SignerProfile[]
  currentId: string
  onChange: (id: string) => void
}) {
  const current = useMemo(
    () => signers.find((s) => s.id === currentId) ?? null,
    [signers, currentId]
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute -top-2 -right-2 size-5 rounded-full border"
          style={{ background: signerColor(currentId) }}
          aria-label="change signer"
        />
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-1 p-1">
        <div className="px-2 py-1 text-xs text-muted-foreground">
          指派給：{current?.name ?? "?"}
        </div>
        {signers.map((s) => (
          <Button
            key={s.id}
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => onChange(s.id)}
          >
            <Avatar className="size-5">
              <AvatarImage src={s.avatar_url ?? undefined} />
              <AvatarFallback>{s.name.slice(0, 1)}</AvatarFallback>
            </Avatar>
            {s.name}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
