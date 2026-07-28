"use client"

import { useState } from "react"

import { IconChevronDown, IconX } from "@tabler/icons-react"

import { Badge } from "@workspace/ui/components/badge"
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
import { useDialogPopoverScroll } from "@workspace/ui/hooks/use-dialog-popover-scroll"

import type { LabUser } from "@/hooks/rooms/use-lab-users"

function label(u: LabUser): string {
  return u.name ?? u.accountId ?? u.id
}

export function AttendeeSelect({
  users,
  value,
  onChange,
}: {
  users: LabUser[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const scrollRef = useDialogPopoverScroll<HTMLDivElement>()

  const selected = value
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is LabUser => u !== undefined)

  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id]
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={value.length ? "" : "text-muted-foreground"}>
              {value.length ? `已選 ${value.length} 人` : "（可不填）"}
            </span>
            <IconChevronDown data-icon="inline-end" className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={scrollRef}
          className="w-(--radix-popover-trigger-width) p-0"
        >
          <Command>
            <CommandInput placeholder="搜尋姓名或帳號 id" />
            <CommandList>
              <CommandEmpty>找不到成員</CommandEmpty>
              <CommandGroup>
                {users.map((u) => (
                  <CommandItem
                    key={u.id}
                    // cmdk matches against this string, so both the display
                    // name and the account id have to be in it for either to
                    // be searchable.
                    value={[u.name, u.accountId, u.id]
                      .filter(Boolean)
                      .join(" ")}
                    onSelect={() => toggle(u.id)}
                  >
                    <span
                      className={
                        value.includes(u.id) ? "font-medium" : undefined
                      }
                    >
                      {label(u)}
                    </span>
                    {u.accountId && u.name && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {u.accountId}
                      </span>
                    )}
                    {value.includes(u.id) && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        已選
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((u) => (
            <Badge key={u.id} variant="secondary" className="gap-1">
              {label(u)}
              <button
                type="button"
                aria-label={`移除 ${label(u)}`}
                onClick={() => toggle(u.id)}
                className="cursor-pointer opacity-60 hover:opacity-100"
              >
                <IconX className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
