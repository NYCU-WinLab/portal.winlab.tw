"use client"

import { IconChevronDown } from "@tabler/icons-react"
import { useState } from "react"

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

import type { PaperAvailability } from "@/lib/meetings/papers"
import type { TeacherPaper } from "@/lib/meetings/types"

interface PaperSelectProps {
  papers: TeacherPaper[]
  /** teacherPaperId → whether it can be picked for this meeting, and why not. */
  availability: Map<string, PaperAvailability>
  /** The paper this meeting currently holds — always selectable. */
  currentPaperId: string | null
  value: string
  onSelect: (id: string) => void
}

const NONE = "__none__"

function reasonTag(a: PaperAvailability | undefined): string {
  if (!a || a.available) return ""
  if (a.reason === "self-repeat") return "你報過了"
  if (a.reason === "cooldown") {
    return a.cooldownUntil ? `冷卻至 ${a.cooldownUntil}` : "冷卻中"
  }
  return "無法選"
}

export function PaperSelect({
  papers,
  availability,
  currentPaperId,
  value,
  onSelect,
}: PaperSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = papers.find((p) => p.id === value) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span
            className={selected ? "truncate" : "truncate text-muted-foreground"}
          >
            {selected?.paperName ?? "（從老師 Papers 選一篇）"}
          </span>
          <IconChevronDown data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder="搜尋 paper" />
          <CommandList>
            <CommandEmpty>老師尚未提供 paper</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={NONE}
                onSelect={() => {
                  onSelect(NONE)
                  setOpen(false)
                }}
              >
                （未指定）
              </CommandItem>
              {papers.map((p) => {
                const a = availability.get(p.id)
                const blocked = !!a && !a.available && p.id !== currentPaperId
                const tag = blocked ? reasonTag(a) : ""
                return (
                  <CommandItem
                    key={p.id}
                    // Include the reason so a blocked paper still matches a
                    // search for e.g. the person who has it.
                    value={`${p.paperName} ${a?.blockedBy?.presenter ?? ""} ${tag}`}
                    disabled={blocked}
                    onSelect={() => {
                      onSelect(p.id)
                      setOpen(false)
                    }}
                  >
                    <span className="truncate">{p.paperName}</span>
                    {blocked && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {tag}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
