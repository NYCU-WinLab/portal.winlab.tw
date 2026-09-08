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

import type { LabUser } from "@/hooks/reimburse/use-lab-users"
import { useLabUsers } from "@/hooks/reimburse/use-lab-users"

export function ApplicantSelect({
  id,
  value,
  onSelect,
}: {
  id?: string
  /**
   * Current applicant name. Records predating the picker may hold a name
   * that matches no member; it still shows on the trigger so editing other
   * fields doesn't force re-picking the applicant.
   */
  value: string
  onSelect: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const scrollRef = useDialogPopoverScroll<HTMLDivElement>()
  const { data: users = [] } = useLabUsers()

  const named = users.filter((u): u is LabUser & { name: string } => !!u.name)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={value ? "" : "text-muted-foreground"}>
            {value || "選擇申請人"}
          </span>
          <IconChevronDown data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={scrollRef}
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command>
          <CommandInput placeholder="搜尋姓名或信箱" />
          <CommandList>
            <CommandEmpty>找不到成員</CommandEmpty>
            <CommandGroup>
              {named.map((u) => (
                <CommandItem
                  key={u.id}
                  value={`${u.name} ${u.email ?? ""}`}
                  onSelect={() => {
                    onSelect(u.name)
                    setOpen(false)
                  }}
                >
                  <div className="flex flex-col">
                    <span>{u.name}</span>
                    {u.email && (
                      <span className="text-xs text-muted-foreground">
                        {u.email}
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
