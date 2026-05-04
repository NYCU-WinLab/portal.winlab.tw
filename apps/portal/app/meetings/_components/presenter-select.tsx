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

interface PresenterSelectProps {
  users: { id: string; name: string | null }[]
  value: string
  onSelect: (userId: string) => void
}

export function PresenterSelect({ users, value, onSelect }: PresenterSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = users.find((u) => u.id === value) ?? null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected?.name ?? "（未指定）"}
          </span>
          <IconChevronDown data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
        <Command>
          <CommandInput placeholder="搜尋報告人" />
          <CommandList>
            <CommandEmpty>找不到成員</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onSelect("__none__")
                  setOpen(false)
                }}
              >
                （未指定）
              </CommandItem>
              {users.map((u) => (
                <CommandItem
                  key={u.id}
                  value={u.name ?? u.id}
                  onSelect={() => {
                    onSelect(u.id)
                    setOpen(false)
                  }}
                >
                  {u.name ?? u.id}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
