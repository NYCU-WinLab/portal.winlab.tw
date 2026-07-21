"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  useTeacherPapers,
  useDeleteTeacherPaper,
  usePaperAssignments,
  useTags,
} from "@/hooks/meetings/use-teacher-papers"
import { useMeetingsAdmin } from "@/hooks/meetings/use-meetings-admin"
import { paperCooldownStatus } from "@/lib/meetings/papers"
import type { TeacherPaper } from "@/lib/meetings/types"

import { EditPaperDialog } from "./edit-paper-dialog"
import { TagChip } from "./tag-chip"

export function PapersTab() {
  const { isAdmin } = useMeetingsAdmin()
  const { data: papers = [], isLoading } = useTeacherPapers()
  const { data: assignments = [] } = usePaperAssignments()
  const { data: tags = [] } = useTags()
  const deletePaper = useDeleteTeacherPaper()

  const [editTarget, setEditTarget] = useState<TeacherPaper | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  // OR filter: a paper shows if it carries any of the selected tags.
  const [selected, setSelected] = useState<string[]>([])
  function toggle(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (papers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">尚無老師提供的 papers。</p>
    )
  }

  const shown =
    selected.length === 0
      ? papers
      : papers.filter((p) => p.tags.some((t) => selected.includes(t.id)))

  return (
    <div className="flex flex-col gap-3">
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">篩選：</span>
          {tags.map((t) => (
            <TagChip
              key={t.id}
              name={t.name}
              color={t.color}
              selected={selected.includes(t.id)}
              onClick={() => toggle(t.id)}
            />
          ))}
          {selected.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setSelected([])}
            >
              清除
            </Button>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">日期</TableHead>
              <TableHead>Paper 名稱</TableHead>
              <TableHead className="min-w-[160px]">標籤</TableHead>
              <TableHead className="w-40">狀態</TableHead>
              <TableHead className="w-20">來源</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  沒有符合所選標籤的 paper
                </TableCell>
              </TableRow>
            ) : (
              shown.map((p) => {
                const status = paperCooldownStatus(p.id, assignments, today)
                return (
                  <TableRow
                    key={p.id}
                    className={status.inCooldown ? "opacity-50" : undefined}
                  >
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.providedDate).toLocaleDateString("zh-TW", {
                        year: "numeric",
                        month: "numeric",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      {p.fileLink ? (
                        <a
                          href={p.fileLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm hover:underline"
                        >
                          {p.paperName}
                        </a>
                      ) : (
                        <span className="text-sm">{p.paperName}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.tags.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {p.tags.map((t) => (
                            <TagChip key={t.id} name={t.name} color={t.color} />
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {status.inCooldown ? (
                        <span className="text-muted-foreground">
                          {status.blockedBy?.presenter ?? "已"}報過 ·{" "}
                          {status.cooldownUntil} 解鎖
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          可選
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.source ?? "—"}
                    </TableCell>
                    <TableCell>
                      {isAdmin && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setEditTarget(p)}
                          >
                            編輯
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => deletePaper.mutate(p.id)}
                          >
                            刪除
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {editTarget && (
        <EditPaperDialog
          paper={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => {
            if (!open) setEditTarget(null)
          }}
        />
      )}
    </div>
  )
}
