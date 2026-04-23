"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
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
import { IconPlus, IconX } from "@tabler/icons-react"

import { createClient } from "@/lib/supabase/client"
import { setSigners } from "../actions"

type Candidate = {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
}

export function SignerPicker({
  documentId,
  initialSignerIds,
  onChange,
}: {
  documentId: string
  initialSignerIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selected, setSelected] = useState<string[]>(initialSignerIds)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase.from("user_profiles").select(
        `id, name, email,
           member:members!inner(avatar_url)`
      )
      setCandidates(
        (data ?? []).map((row) => {
          const r = row as typeof row & {
            id: string
            name: string | null
            email: string | null
            member?: { avatar_url: string | null }
          }
          return {
            id: r.id,
            name: r.name ?? r.email ?? "Unknown",
            email: r.email,
            avatar_url: r.member?.avatar_url ?? null,
          }
        })
      )
    })()
  }, [])

  const byId = useMemo(() => {
    const m = new Map<string, Candidate>()
    for (const c of candidates) m.set(c.id, c)
    return m
  }, [candidates])

  async function mutate(next: string[]) {
    setSelected(next)
    onChange(next)
    try {
      await setSigners(documentId, next)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((id) => {
        const c = byId.get(id)
        return (
          <span
            key={id}
            className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-2 pl-1 text-xs"
          >
            <Avatar className="size-5">
              <AvatarImage src={c?.avatar_url ?? undefined} />
              <AvatarFallback>{(c?.name ?? "?").slice(0, 1)}</AvatarFallback>
            </Avatar>
            {c?.name ?? id.slice(0, 6)}
            <button
              type="button"
              aria-label="remove"
              onClick={() => mutate(selected.filter((s) => s !== id))}
            >
              <IconX className="size-3" />
            </button>
          </span>
        )
      })}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <IconPlus className="size-4" />加 signer
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-0">
          <Command>
            <CommandInput placeholder="搜尋成員..." />
            <CommandList>
              <CommandEmpty>沒有符合</CommandEmpty>
              <CommandGroup>
                {candidates
                  .filter((c) => !selected.includes(c.id))
                  .map((c) => (
                    <CommandItem
                      key={c.id}
                      onSelect={() => {
                        mutate([...selected, c.id])
                        setOpen(false)
                      }}
                    >
                      <Avatar className="size-5">
                        <AvatarImage src={c.avatar_url ?? undefined} />
                        <AvatarFallback>{c.name.slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <span>{c.name}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
