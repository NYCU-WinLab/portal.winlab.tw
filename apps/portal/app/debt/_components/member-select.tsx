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

import type { Member } from "@/lib/debt/types"

interface MemberSelectProps {
  members: Member[]
  value: string
  onSelect: (memberId: string) => void
  excludeIds?: string[]
  placeholder?: string
}

export function MemberSelect({
  members,
  value,
  onSelect,
  excludeIds = [],
  placeholder = "選擇成員",
}: MemberSelectProps) {
  const [open, setOpen] = useState(false)
  const filtered = members.filter((m) => !excludeIds.includes(m.id))
  const selected = filtered.find((m) => m.id === value) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected?.name ?? placeholder}
          </span>
          <IconChevronDown data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder="搜尋成員" />
          <CommandList>
            <CommandEmpty>找不到成員</CommandEmpty>
            <CommandGroup>
              {filtered.map((member) => (
                <CommandItem
                  key={member.id}
                  value={member.name ?? member.id}
                  data-checked={member.id === value}
                  onSelect={() => {
                    onSelect(member.id)
                    setOpen(false)
                  }}
                >
                  {member.name ?? "(unnamed)"}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
