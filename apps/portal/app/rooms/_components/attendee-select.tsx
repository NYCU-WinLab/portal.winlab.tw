"use client"

import { useState } from "react"

import { IconChevronDown, IconX } from "@tabler/icons-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"
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

import type {
  AttendeeContact,
  PickableGroup,
} from "@/lib/rooms/attendee-groups"
import {
  ADVISOR_USERNAME,
  groupLabel,
  mergeAttendees,
} from "@/lib/rooms/attendee-groups"
import type { LabUser } from "@/hooks/rooms/use-lab-users"

function label(u: LabUser): string {
  return u.name ?? u.username ?? u.email ?? u.id
}

export function AttendeeSelect({
  users,
  groups = [],
  groupsNote,
  value,
  onChange,
  onGroupPicked,
  advisorIncluded,
  onAdvisorIncludedChange,
}: {
  users: LabUser[]
  groups?: PickableGroup[]
  /**
   * Why there are no group buttons, when there are none. Always set unless
   * the groups actually loaded: "no buttons and no explanation" is the one
   * outcome that can't be debugged from a screenshot.
   */
  groupsNote?: string | null
  value: AttendeeContact[]
  onChange: (next: AttendeeContact[]) => void
  /** Fired when a whole group is added, so the title can be pre-filled. */
  onGroupPicked?: (group: PickableGroup) => void
  /**
   * The advisor is its own control rather than an entry in `value`: he's on
   * by default and Keycloak's project groups never list him, so treating him
   * as an ordinary pick would mean seeding the list from an async query and
   * guessing whether a later removal was deliberate.
   */
  advisorIncluded: boolean
  onAdvisorIncludedChange: (next: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  // Reset after every pick so the next name can be typed straight away —
  // otherwise the previous query keeps the list filtered down to one person.
  const [search, setSearch] = useState("")
  const scrollRef = useDialogPopoverScroll<HTMLDivElement>()

  const selectedEmails = new Set(value.map((a) => a.email.toLowerCase()))

  function toggle(contact: AttendeeContact) {
    const key = contact.email.toLowerCase()
    onChange(
      selectedEmails.has(key)
        ? value.filter((a) => a.email.toLowerCase() !== key)
        : [...value, contact]
    )
    setSearch("")
  }

  // Only members with an address can be invited; the rest are surfaced in
  // the button's tooltip rather than quietly shrinking the group.
  const mailable = users.filter(
    (u): u is LabUser & { email: string } => !!u.email
  )

  const advisor = mailable.find((u) => u.username === ADVISOR_USERNAME)

  return (
    <div className="flex flex-col gap-1.5">
      {groups.length === 0 && groupsNote && (
        <p className="text-xs text-muted-foreground">{groupsNote}</p>
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
                g.unmailable.length > 0
                  ? `${g.members.length} 人；${g.unmailable.length} 人在 Keycloak 沒有 email,無法邀請:${g.unmailable.join("、")}`
                  : `${g.members.length} 人`
              }
              onClick={() => {
                onChange(mergeAttendees(value, g.members))
                onGroupPicked?.(g)
              }}
            >
              {groupLabel(g)}
              <span className="ml-1 opacity-60">{g.members.length}</span>
            </Button>
          ))}
        </div>
      )}

      {advisor && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-advisor"
            checked={advisorIncluded}
            onCheckedChange={(next) => onAdvisorIncludedChange(next === true)}
          />
          <Label
            htmlFor="include-advisor"
            className="text-xs font-normal text-muted-foreground"
          >
            包含 {label(advisor)}（群組名單不含老師）
          </Label>
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
            <CommandInput
              placeholder="搜尋姓名或帳號"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>找不到成員</CommandEmpty>
              <CommandGroup>
                {mailable.map((u) => (
                  <CommandItem
                    key={u.id}
                    // cmdk matches against this string, so both the display
                    // name and the account name have to be in it for either
                    // to be searchable.
                    value={[u.name, u.username, u.email]
                      .filter(Boolean)
                      .join(" ")}
                    onSelect={() => toggle({ name: label(u), email: u.email })}
                  >
                    <span
                      className={
                        selectedEmails.has(u.email.toLowerCase())
                          ? "font-medium"
                          : undefined
                      }
                    >
                      {label(u)}
                    </span>
                    {u.username && u.name && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {u.username}
                      </span>
                    )}
                    {selectedEmails.has(u.email.toLowerCase()) && (
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

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((a) => (
            <Badge key={a.email} variant="secondary" className="gap-1">
              {a.name}
              <button
                type="button"
                aria-label={`移除 ${a.name}`}
                onClick={() => toggle(a)}
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
