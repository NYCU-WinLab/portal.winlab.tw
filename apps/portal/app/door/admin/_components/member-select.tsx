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
import { useDialogPopoverScroll } from "@workspace/ui/hooks/use-dialog-popover-scroll"

import type { Member } from "./card-form-dialog"

// A member the picker can never resolve to a real id, so the form knows a guest
// card is meant. Matches the sentinel the form stores in holder_user_id.
export const NO_HOLDER = "__none__"

const GUEST_LABEL = "無成員（訪客）"

// One member holds many cards, so nothing here filters out an already-used
// member: the same person picking a second card is the normal case.
export function MemberSelect({
  id,
  members,
  value,
  autoFocus,
  onSelect,
}: {
  id?: string
  members: Member[]
  value: string
  autoFocus?: boolean
  onSelect: (holderUserId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const scrollRef = useDialogPopoverScroll<HTMLDivElement>()
  const selected =
    value === NO_HOLDER ? null : (members.find((m) => m.id === value) ?? null)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          autoFocus={autoFocus}
          className="w-full justify-between font-normal"
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected
              ? (selected.name ?? selected.email ?? selected.id)
              : GUEST_LABEL}
          </span>
          <IconChevronDown data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={scrollRef}
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command>
          <CommandInput placeholder="搜尋成員姓名或信箱" />
          <CommandList>
            <CommandEmpty>找不到成員</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={GUEST_LABEL}
                onSelect={() => {
                  onSelect(NO_HOLDER)
                  setOpen(false)
                }}
              >
                {GUEST_LABEL}
              </CommandItem>
              {members.map((member) => (
                <CommandItem
                  key={member.id}
                  value={`${member.name ?? ""} ${member.email ?? ""} ${member.id}`}
                  onSelect={() => {
                    onSelect(member.id)
                    setOpen(false)
                  }}
                >
                  <div className="flex flex-col">
                    <span>{member.name ?? member.email ?? member.id}</span>
                    {member.name && member.email && (
                      <span className="text-xs text-muted-foreground">
                        {member.email}
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
