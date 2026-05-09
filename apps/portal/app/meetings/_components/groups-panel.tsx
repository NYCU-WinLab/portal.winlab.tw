"use client"

import { useState } from "react"

import { IconPlus, IconTrash, IconX } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"

import { useLabUsers } from "@/hooks/meetings/use-lab-users"
import {
  useAddMeetingGroup,
  useDeleteMeetingGroup,
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
  const [draft, setDraft] = useState<string[]>(members)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const update = useUpdateMeetingGroup()
  const del = useDeleteMeetingGroup()
  const { data: labUsers = [] } = useLabUsers()

  function toggleUser(name: string) {
    setDraft((prev) =>
      prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]
    )
  }

  function save() {
    update.mutate(
      { groupNumber, members: draft },
      { onSuccess: () => setEditing(false) }
    )
  }

  function cancelEdit() {
    setDraft(members)
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          小組 {groupNumber}
        </span>

        {isAdmin && !editing && (
          <div className="flex items-center gap-1">
            {confirmDelete ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  disabled={del.isPending}
                  onClick={() => del.mutate(groupNumber)}
                >
                  確定刪除
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setConfirmDelete(false)}
                >
                  <IconX className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground"
                  onClick={() => {
                    setDraft(members)
                    setEditing(true)
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {labUsers.map((u) => {
              const name = u.name ?? ""
              const selected = draft.includes(name)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleUser(name)}
                  className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
                    selected
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {name}
                </button>
              )
            })}
          </div>
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
              onClick={cancelEdit}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {members.length === 0 ? (
            <span className="text-xs text-muted-foreground">（空組）</span>
          ) : (
            members.map((m) => (
              <span key={m} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                {m}
              </span>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function GroupsPanel({ isAdmin }: { isAdmin: boolean }) {
  const { data: groups = [], isLoading } = useMeetingGroups()
  const add = useAddMeetingGroup()

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">載入中…</p>
  }

  const nextNumber =
    groups.length > 0 ? Math.max(...groups.map((g) => g.groupNumber)) + 1 : 1

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">提問小組</p>
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-muted-foreground"
            disabled={add.isPending}
            onClick={() => add.mutate(nextNumber)}
          >
            <IconPlus className="h-3 w-3" />
            新增小組
          </Button>
        )}
      </div>
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
