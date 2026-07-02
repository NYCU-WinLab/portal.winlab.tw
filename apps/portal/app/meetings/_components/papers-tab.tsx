"use client"

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
} from "@/hooks/meetings/use-teacher-papers"
import { useMeetingsAdmin } from "@/hooks/meetings/use-meetings-admin"

export function PapersTab() {
  const { isAdmin } = useMeetingsAdmin()
  const { data: papers = [], isLoading } = useTeacherPapers()
  const deletePaper = useDeleteTeacherPaper()

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

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">日期</TableHead>
            <TableHead>Paper 名稱</TableHead>
            <TableHead className="w-20">來源</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {papers.map((p) => (
            <TableRow key={p.id}>
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
              <TableCell className="text-xs text-muted-foreground">
                {p.source ?? "—"}
              </TableCell>
              <TableCell>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => deletePaper.mutate(p.id)}
                  >
                    刪除
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
