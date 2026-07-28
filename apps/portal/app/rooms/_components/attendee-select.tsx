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

import type { PortalAttendeeGroup } from "@/lib/rooms/attendee-groups"
import type { LabUser } from "@/hooks/rooms/use-lab-users"

function label(u: LabUser): string {
  return u.name ?? u.accountId ?? u.id
}

/** Why the group shortcuts couldn't be offered, when they couldn't. */
export type GroupsProblem =
  | { status: "unconfigured" }
  | { status: "forbidden"; detail: string }
  | { status: "error"; detail: string }

function problemMessage(problem: GroupsProblem): string | null {
  switch (problem.status) {
    // Keycloak isn't wired up at all — nothing to say to a member about it.
    case "unconfigured":
      return null
    case "forbidden":
      return "無法讀取 Keycloak 群組:admin client 權限不足(需要 view-users)"
    case "error":
      return `無法讀取 Keycloak 群組:${problem.detail}`
  }
}

export function AttendeeSelect({
  users,
  groups = [],
  groupsProblem,
  value,
  onChange,
}: {
  users: LabUser[]
  groups?: PortalAttendeeGroup[]
  groupsProblem?: GroupsProblem
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const scrollRef = useDialogPopoverScroll<HTMLDivElement>()

  function addGroup(group: PortalAttendeeGroup) {
    onChange([...new Set([...value, ...group.userIds])])
  }

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
      {groupsProblem && problemMessage(groupsProblem) && (
        <p className="text-xs text-muted-foreground">
          {problemMessage(groupsProblem)}
        </p>
      )}

      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">整組加入:</span>
          {groups.map((g) => (
            <Button
              key={g.id}
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-xs"
              title={
                g.unmatched.length > 0
                  ? `${g.userIds.length} 人；${g.unmatched.length} 人沒有 Portal 帳號:${g.unmatched.join("、")}`
                  : `${g.userIds.length} 人`
              }
              onClick={() => addGroup(g)}
            >
              {g.name}
              <span className="ml-1 opacity-60">{g.userIds.length}</span>
            </Button>
          ))}
        </div>
      )}

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
