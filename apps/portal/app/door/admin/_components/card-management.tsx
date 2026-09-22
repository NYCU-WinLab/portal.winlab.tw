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

import { SYNC_STATE_LABELS, type DoorCardView } from "@/lib/door/cards"
import type { ControllerHealth } from "@/lib/door/hams"

import {
  addDoorCard,
  deleteDoorCard,
  importFromController,
  reconcileDoorCards,
  updateDoorCard,
  type DoorCardMutation,
} from "../actions"
import { CardReader } from "./card-reader"
import {
  CardFormDialog,
  type CardFormValues,
  type Member,
} from "./card-form-dialog"

const timestamp = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

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
  // Non-null when the add form is reopening a row the controller lost: the
  // card number, name, holder and note are all still here, and retyping them
  // is how they get lost for real.
  const [addSeed, setAddSeed] = useState<DoorCardView | null>(null)
  // A card number tapped on the reader, used to prefill a fresh add form. Kept
  // apart from addSeed so the form still reads "新增卡片", not "重新加入卡機".
  const [addPrefillCardId, setAddPrefillCardId] = useState<string | null>(null)
  const [editing, setEditing] = useState<DoorCardView | null>(null)
  const [deleting, setDeleting] = useState<DoorCardView | null>(null)

  const memberNames = useMemo(
    () => new Map(members.map((m) => [m.id, m.name ?? m.email ?? m.id])),
    [members]
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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">門禁卡管理</h1>
        <p className="text-sm text-muted-foreground">
          這裡是門禁卡機的卡片名單，新增、改名、刪除都會直接寫進卡機。
        </p>
      </div>

      <StatusStrip
        health={health}
        healthError={healthError}
        controllerError={controllerError}
        pending={pending}
        onImport={() => run(importFromController)}
        onReconcile={() => run(reconcileDoorCards)}
      />

      <CardReader
        cards={cards}
        disabled={pending}
        onEnrol={(cardNumber) => {
          setAddSeed(null)
          setAddPrefillCardId(cardNumber)
          setAddOpen(true)
        }}
      >
        <Button
          size="sm"
          onClick={() => {
            setAddSeed(null)
            setAddPrefillCardId(null)
            setAddOpen(true)
          }}
          disabled={pending}
        >
          新增卡片
        </Button>
      </CardReader>

      <div className="rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">卡號</TableHead>
              <TableHead>姓名</TableHead>
              <TableHead>持有人</TableHead>
              <TableHead>備註</TableHead>
              <TableHead className="w-28">卡機</TableHead>
              <TableHead className="w-28">最後同步</TableHead>
              <TableHead className="w-44 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  名單還是空的，先按「匯入卡機清單」把卡機上的卡收進來。
                </TableCell>
              </TableRow>
            ) : (
              cards.map((card) => (
                <TableRow key={card.card_id}>
                  <TableCell className="font-mono text-xs tabular-nums">
                    {card.card_id}
                  </TableCell>
                  <TableCell className="font-medium">
                    {card.holder_name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {card.holder_user_id
                      ? (memberNames.get(card.holder_user_id) ??
                        card.holder_user_id)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {card.note ?? "—"}
                  </TableCell>
                  <TableCell>
                    <SyncBadge card={card} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {card.last_seen_at
                      ? timestamp.format(new Date(card.last_seen_at))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {card.in_database ? (
                      <div className="flex justify-end gap-1">
                        {card.sync_state === "missing_on_controller" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              setAddSeed(card)
                              setAddOpen(true)
                            }}
                          >
                            重新加入卡機
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => setEditing(card)}
                        >
                          編輯
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => setDeleting(card)}
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

      <CardFormDialog
        mode="add"
        card={addSeed}
        prefillCardId={addPrefillCardId ?? undefined}
        autoFocusHolder={addPrefillCardId !== null}
        members={members}
        open={addOpen}
        pending={pending}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) setAddPrefillCardId(null)
        }}
        onSubmit={(values: CardFormValues) =>
          run(
            () => addDoorCard(values),
            () => {
              setAddOpen(false)
              setAddPrefillCardId(null)
            }
          )
        }
      />

      <CardFormDialog
        mode="edit"
        card={editing}
        members={members}
        open={!!editing}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSubmit={(values: CardFormValues) => {
          const target = editing
          if (!target) return
          run(
            () =>
              updateDoorCard(target.card_id, {
                holder_name: values.holder_name,
                holder_user_id: values.holder_user_id,
                note: values.note,
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
            <AlertDialogTitle>刪除這張卡？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${deleting.holder_name}（${deleting.card_id}）會從卡機上移除，之後這張卡刷不開門。`
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
                run(
                  () => deleteDoorCard(target.card_id),
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

function SyncBadge({ card }: { card: DoorCardView }) {
  const label = SYNC_STATE_LABELS[card.sync_state]
  if (card.sync_state === "synced")
    return (
      <Badge variant="secondary" className="text-xs">
        {label}
      </Badge>
    )
  if (card.sync_state === "unknown")
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

function Field({
  label,
  value,
  tone = "normal",
}: {
  label: string
  value: string
  tone?: "normal" | "warn"
}) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={
          tone === "warn"
            ? "font-medium text-destructive tabular-nums"
            : "font-medium tabular-nums"
        }
      >
        {value}
      </span>
    </span>
  )
}
