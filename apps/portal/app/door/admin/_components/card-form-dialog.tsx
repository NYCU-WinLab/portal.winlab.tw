"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  big5ByteLength,
  CARD_ID_LENGTH,
  HOLDER_NAME_MAX_BYTES,
  validateCardId,
  validateHolderName,
  type DoorCardView,
} from "@/lib/door/cards"

export type Member = { id: string; name: string | null; email: string | null }

export type CardFormValues = {
  card_id: string
  holder_name: string
  holder_user_id: string | null
  note: string | null
}

// Radix Select has no empty-string value, so "no portal account" needs a
// sentinel. Guest and spare cards are the reason the column is nullable.
const NO_HOLDER = "__none__"

type CardFormProps = {
  mode: "add" | "edit"
  card?: DoorCardView | null
  members: Member[]
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: CardFormValues) => void
}

// The fields live one level down so the dialog content can be keyed on the
// card: Radix unmounts it when closed, which is what resets the form between
// two different cards without an effect copying props into state.
export function CardFormDialog(props: CardFormProps) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!props.pending) props.onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md">
        <CardForm key={props.card?.card_id ?? "new"} {...props} />
      </DialogContent>
    </Dialog>
  )
}

function CardForm({
  mode,
  card,
  members,
  pending,
  onOpenChange,
  onSubmit,
}: CardFormProps) {
  const [cardId, setCardId] = useState(card?.card_id ?? "")
  const [holderName, setHolderName] = useState(card?.holder_name ?? "")
  const [holderUserId, setHolderUserId] = useState(
    card?.holder_user_id ?? NO_HOLDER
  )
  const [note, setNote] = useState(card?.note ?? "")

  const cardIdError = mode === "add" ? validateCardId(cardId) : null
  const nameError = validateHolderName(holderName)
  const nameBytes = big5ByteLength(holderName.trim())

  function handleSubmit() {
    if (cardIdError || nameError) return
    onSubmit({
      card_id: cardId.trim(),
      holder_name: holderName.trim(),
      holder_user_id: holderUserId === NO_HOLDER ? null : holderUserId,
      note: note.trim() || null,
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {mode === "edit" ? "編輯卡片" : card ? "重新加入卡機" : "新增卡片"}
        </DialogTitle>
        <DialogDescription>
          {mode === "edit"
            ? "改姓名會同步到卡機；持有人和備註只存在 Portal。"
            : card
              ? "把這張卡再寫回卡機一次。持有人和備註會留著，不用重打。"
              : "先寫進卡機，成功了才會記到名單上。"}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="card-id">卡號</Label>
          <Input
            id="card-id"
            inputMode="numeric"
            autoComplete="off"
            maxLength={CARD_ID_LENGTH}
            value={cardId}
            disabled={mode === "edit"}
            onChange={(e) => setCardId(e.target.value.replace(/[^0-9]/g, ""))}
            className="font-mono tabular-nums"
            placeholder="0001234567"
          />
          <p className="text-xs text-muted-foreground">
            卡片上印的 {CARD_ID_LENGTH} 位數字，開頭的 0 要一起輸入。
          </p>
          {cardId.length > 0 && cardIdError && (
            <p className="text-xs text-destructive">{cardIdError}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="holder-name">姓名</Label>
          <Input
            id="holder-name"
            value={holderName}
            autoComplete="off"
            onChange={(e) => setHolderName(e.target.value)}
            placeholder="卡機上顯示的名字"
          />
          <p className="text-xs text-muted-foreground">
            卡機只存這個名字，最多 {HOLDER_NAME_MAX_BYTES} 個位元組（中文算
            2、英數算 1），目前 {nameBytes}。
          </p>
          {holderName.length > 0 && nameError && (
            <p className="text-xs text-destructive">{nameError}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="holder-user">持有人</Label>
          <Select value={holderUserId} onValueChange={setHolderUserId}>
            <SelectTrigger id="holder-user" className="w-full">
              <SelectValue placeholder="選一位成員" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_HOLDER}>不對應 Portal 帳號</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name ?? member.email ?? member.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="card-note">備註</Label>
          <Textarea
            id="card-note"
            value={note}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder="訪客卡、備用卡、借給誰…"
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          取消
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={pending || !!cardIdError || !!nameError}
        >
          {pending
            ? "處理中…"
            : mode === "edit"
              ? "儲存"
              : card
                ? "重新加入"
                : "新增"}
        </Button>
      </DialogFooter>
    </>
  )
}
