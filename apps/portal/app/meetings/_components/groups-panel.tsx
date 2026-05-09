"use client"

import { useState } from "react"

import { IconPencil } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import {
  useMeetingGroups,
  useUpdateMeetingGroup,
} from "@/hooks/meetings/use-meeting-groups"

function GroupCard({
  groupNumber,
  members,
  isAdmin,
}: {
  groupNumber: number
  members: string[]
  isAdmin: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(members.join(" "))
  const update = useUpdateMeetingGroup()

  function save() {
    const next = draft
      .split(/[\s,、]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    update.mutate(
      { groupNumber, members: next },
      { onSuccess: () => setEditing(false) }
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          小組 {groupNumber}
        </span>
        {isAdmin && !editing && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={() => {
              setDraft(members.join(" "))
              setEditing(true)
            }}
          >
            <IconPencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="以空格或逗號分隔"
            className="h-8 text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={update.isPending}
              onClick={save}
            >
              {update.isPending ? "儲存中…" : "儲存"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setEditing(false)}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <span key={m} className="rounded-md bg-muted px-2 py-0.5 text-xs">
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function GroupsPanel({ isAdmin }: { isAdmin: boolean }) {
  const { data: groups = [], isLoading } = useMeetingGroups()

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">載入中…</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">提問小組</p>
      <div className="grid grid-cols-2 gap-2">
        {groups.map((g) => (
          <GroupCard
            key={g.groupNumber}
            groupNumber={g.groupNumber}
            members={g.members}
            isAdmin={isAdmin}
          />
        ))}
      </div>
      {isAdmin && (
        <p className="text-xs text-muted-foreground">
          ＊若有組員於同週報告，將與下一組的成員對調
        </p>
      )}
    </div>
  )
}
