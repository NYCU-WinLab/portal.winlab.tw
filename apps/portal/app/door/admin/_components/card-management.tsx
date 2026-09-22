"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  groupCardsByHolder,
  SYNC_STATE_LABELS,
  type DoorCardSyncState,
  type DoorCardView,
  type HolderGroup,
} from "@/lib/door/cards"
import type { ControllerHealth } from "@/lib/door/hams"

import {
  deleteHolderCards,
  importFromController,
  reconcileDoorCards,
  saveHolderCards,
  type DoorCardMutation,
  type HolderCardsResult,
} from "../actions"
import { HolderFormDialog, type Member } from "./card-form-dialog"

export function CardManagement({
  cards,
  controllerError,
  health,
  healthError,
  members,
}: {
  cards: DoorCardView[]
  controllerError: string | null
  health: ControllerHealth | null
  healthError: string | null
  members: Member[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<HolderGroup | null>(null)
  const [deleting, setDeleting] = useState<HolderGroup | null>(null)

  const holders = useMemo(
    () => groupCardsByHolder(cards, members),
    [cards, members]
  )

  function run(action: () => Promise<DoorCardMutation>, onDone?: () => void) {
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        toast.success(result.message)
        onDone?.()
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  // A holder save / delete touches one card per write, so the result is a list.
  // Report each card that failed on its own and never call it a clean success
  // when some of the set did not land.
  function runHolder(
    action: () => Promise<HolderCardsResult>,
    onDone?: () => void
  ) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const failed = result.results.filter((r) => !r.ok)
      const ok = result.results.filter((r) => r.ok)
      if (result.results.length === 0) {
        toast.success("沒有需要變更的卡片。")
      } else if (failed.length === 0) {
        toast.success(`已更新 ${ok.length} 張卡片。`)
      } else {
        for (const r of failed) toast.error(`卡號 ${r.cardId}：${r.error}`)
        if (ok.length > 0) toast.success(`其中 ${ok.length} 張卡片已更新。`)
      }
      onDone?.()
      router.refresh()
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <h1 className="text-lg font-semibold">門禁卡管理</h1>

      <StatusStrip
        health={health}
        healthError={healthError}
        controllerError={controllerError}
        pending={pending}
        onImport={() => run(importFromController)}
        onReconcile={() => run(reconcileDoorCards)}
      />

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)} disabled={pending}>
          新增持有人
        </Button>
      </div>

      <div className="rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>持有人</TableHead>
              <TableHead>備註</TableHead>
              <TableHead className="w-28">卡機</TableHead>
              <TableHead className="w-28 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holders.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  名單還是空的，先按「匯入卡機清單」把卡機上的卡收進來。
                </TableCell>
              </TableRow>
            ) : (
              holders.map((holder) => (
                <TableRow key={holder.key}>
                  <TableCell>
                    <div className="flex flex-col gap-1.5">
                      <span className="font-medium">{holder.displayName}</span>
                      <div className="flex flex-wrap gap-1">
                        {holder.cardIds.map((id) => (
                          <Badge
                            key={id}
                            variant="outline"
                            className="font-mono text-xs tabular-nums"
                          >
                            {id}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {holder.note ?? "—"}
                  </TableCell>
                  <TableCell>
                    <SyncBadge state={holder.syncState} />
                  </TableCell>
                  <TableCell className="text-right">
                    {holder.inDatabase ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => setEditing(holder)}
                        >
                          編輯
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => setDeleting(holder)}
                          className="text-destructive"
                        >
                          刪除
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        待匯入
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <HolderFormDialog
        mode="add"
        members={members}
        allCards={cards}
        open={addOpen}
        pending={pending}
        onOpenChange={setAddOpen}
        onSubmit={(values) =>
          runHolder(
            () =>
              saveHolderCards({
                holderUserId: values.holderUserId,
                holderName: values.holderName,
                note: values.note,
                cardIds: values.cardIds,
                existingCardIds: [],
              }),
            () => setAddOpen(false)
          )
        }
      />

      <HolderFormDialog
        mode="edit"
        group={editing}
        members={members}
        allCards={cards}
        open={!!editing}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSubmit={(values) => {
          const target = editing
          if (!target) return
          runHolder(
            () =>
              saveHolderCards({
                holderUserId: values.holderUserId,
                holderName: values.holderName,
                note: values.note,
                cardIds: values.cardIds,
                existingCardIds: target.cardIds,
              }),
            () => setEditing(null)
          )
        }}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這位持有人的卡片？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${deleting.displayName} 的 ${deleting.cardIds.length} 張卡片會從卡機上移除，之後這些卡刷不開門。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                const target = deleting
                if (!target) return
                runHolder(
                  () => deleteHolderCards(target.cardIds),
                  () => setDeleting(null)
                )
              }}
            >
              {pending ? "處理中…" : "刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SyncBadge({ state }: { state: DoorCardSyncState }) {
  const label = SYNC_STATE_LABELS[state]
  if (state === "synced")
    return (
      <Badge variant="secondary" className="text-xs">
        {label}
      </Badge>
    )
  if (state === "unknown")
    return <span className="text-xs text-muted-foreground">{label}</span>
  return (
    <Badge variant="destructive" className="text-xs">
      {label}
    </Badge>
  )
}

function StatusStrip({
  health,
  healthError,
  controllerError,
  pending,
  onImport,
  onReconcile,
}: {
  health: ControllerHealth | null
  healthError: string | null
  controllerError: string | null
  pending: boolean
  onImport: () => void
  onReconcile: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {health ? (
          <>
            <Field label="卡機韌體" value={health.device_version} />
            <Field label="卡機卡數" value={String(health.card_count)} />
          </>
        ) : (
          <span className="text-sm text-destructive">
            卡機狀態讀不到：{healthError ?? "未知錯誤"}
          </span>
        )}
      </div>

      {controllerError && (
        <p className="text-xs text-destructive">
          卡機清單讀不到，下面是 Portal 存的名單：{controllerError}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onImport}
          disabled={pending}
        >
          匯入卡機清單
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onReconcile}
          disabled={pending}
        >
          與卡機比對
        </Button>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  )
}
