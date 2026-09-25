"use client"

import { useMemo, useState, useTransition } from "react"
import { IconPlus, IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  IP_USER_CATEGORIES,
  networkInfo,
  type IpUserCategory,
  type IpUserEntry,
  type IpUserSettings,
} from "@/lib/admin/ip-users"

import { deleteIpUser } from "../actions"
import { IpUserEditor } from "./ip-user-editor"

const CATEGORY_COLORS: Record<IpUserCategory, string> = {
  personal: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  shared: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  uncertain: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  experiment: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  empty: "bg-muted text-muted-foreground",
  abnormal: "bg-destructive/10 text-destructive",
  unclassified: "bg-muted text-muted-foreground",
}

export function IpUserTable({
  entries,
  settings,
}: {
  entries: IpUserEntry[]
  settings: IpUserSettings | null
}) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("all")
  const [editor, setEditor] = useState<{ entry: IpUserEntry | null } | null>(
    null
  )
  const [deleting, setDeleting] = useState<IpUserEntry | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const info = settings ? networkInfo(settings.subnet) : null
  const isReserved = (ip: string) =>
    ip === settings?.gateway || ip === info?.broadcast

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return entries.filter(
      (row) =>
        (category === "all" || row.category === category) &&
        `${row.ip} ${row.user_name} ${row.notes} ${IP_USER_CATEGORIES[row.category]}`
          .toLowerCase()
          .includes(needle)
    )
  }, [entries, search, category])

  function confirmDelete() {
    if (!deleting) return
    const row = deleting
    setDeleteError(null)
    startTransition(async () => {
      try {
        const result = await deleteIpUser({
          id: row.id,
          expected_revision: row.revision,
        })
        if (!result.ok) {
          setDeleteError(result.error)
          return
        }
        toast.success("已刪除 IP 紀錄")
        setDeleting(null)
      } catch {
        setDeleteError("無法連線，請稍後再試")
      }
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">IP USER</h1>
          <p className="text-sm text-muted-foreground">
            管理實驗室 IP 的使用者、分類與備註。
          </p>
        </div>
        <Button
          size="sm"
          disabled={!settings}
          onClick={() => setEditor({ entry: null })}
        >
          <IconPlus />
          新增紀錄
        </Button>
      </div>

      {settings && info && (
        <dl className="grid gap-5 rounded-xl border border-border p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Gateway", settings.gateway],
            ["Netmask", info.netmask],
            ["DNS", settings.dns_servers.join(" / ")],
          ].map(([label, value]) => (
            <div key={label} className="space-y-1.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-mono text-xs break-all">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜尋 IP、使用者或備註"
              placeholder="搜尋 IP、使用者或備註…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="篩選分類" className="min-w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有分類</SelectItem>
              {Object.entries(IP_USER_CATEGORIES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span
            className="ml-auto text-xs text-muted-foreground"
            aria-live="polite"
          >
            {filtered.length} / {entries.length} 筆
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">IP</TableHead>
                <TableHead>USER</TableHead>
                <TableHead>分類</TableHead>
                <TableHead>備註</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-14 text-center text-sm text-muted-foreground"
                  >
                    {!settings
                      ? "尚未匯入 IP USER 資料。"
                      : entries.length === 0
                        ? "尚無 IP 紀錄。"
                        : "找不到符合的紀錄。"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="py-3.5 pl-4 font-mono text-xs">
                      {row.ip}
                      {isReserved(row.ip) && (
                        <span className="mt-1 block font-sans text-[11px] text-muted-foreground">
                          {row.ip === settings?.gateway
                            ? "Gateway"
                            : "Broadcast"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-48 min-w-28 whitespace-normal">
                      {row.user_name || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={CATEGORY_COLORS[row.category]}
                      >
                        {IP_USER_CATEGORIES[row.category]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-64 min-w-36 text-xs whitespace-pre-wrap text-muted-foreground">
                      {row.notes || "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`編輯 ${row.ip}`}
                          onClick={() => setEditor({ entry: row })}
                        >
                          編輯
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isReserved(row.ip)}
                          aria-label={`刪除 ${row.ip}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setDeleteError(null)
                            setDeleting(row)
                          }}
                        >
                          刪除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {settings?.source_updated_on && (
          <p className="text-xs text-muted-foreground">
            原表更新日期：{settings.source_updated_on}
          </p>
        )}
      </div>

      {editor && (
        <IpUserEditor
          entry={editor.entry}
          reserved={!!editor.entry && isReserved(editor.entry.ip)}
          onClose={() => setEditor(null)}
        />
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除 IP 紀錄？</AlertDialogTitle>
            <AlertDialogDescription>
              將移除 {deleting?.ip}
              {deleting?.user_name ? `（${deleting.user_name}）` : ""}{" "}
              的紀錄。此操作不會變更設備的網路設定。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? "刪除中…" : "確認刪除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
