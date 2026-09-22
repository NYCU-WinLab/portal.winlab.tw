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
import { Textarea } from "@workspace/ui/components/textarea"

import {
  big5ByteLength,
  CARD_ID_LENGTH,
  deriveHolder,
  HOLDER_NAME_MAX_BYTES,
  validateCardId,
  validateHolderName,
  type DoorCardView,
  type HolderChoice,
} from "@/lib/door/cards"

import { MemberSelect, NO_HOLDER } from "./member-select"

export type Member = { id: string; name: string | null; email: string | null }

export type CardFormValues = {
  card_id: string
  holder_name: string
  holder_user_id: string | null
  note: string | null
}

type CardFormProps = {
  mode: "add" | "edit"
  card?: DoorCardView | null
  // A card number captured from the reader: it prefills the add form for a
  // brand-new card, unlike `card`, which reopens an existing row.
  prefillCardId?: string
  autoFocusHolder?: boolean
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
        <CardForm
          key={props.card?.card_id ?? props.prefillCardId ?? "new"}
          {...props}
        />
      </DialogContent>
    </Dialog>
  )
}

function CardForm({
  mode,
  card,
  prefillCardId,
  autoFocusHolder,
  members,
  pending,
  onOpenChange,
  onSubmit,
}: CardFormProps) {
  const [cardId, setCardId] = useState(card?.card_id ?? prefillCardId ?? "")
  const [holderUserId, setHolderUserId] = useState(
    card?.holder_user_id ?? NO_HOLDER
  )
  // Only used for a guest card. In edit mode a card with no member keeps its
  // stored label so switching fields doesn't wipe it.
  const [guestLabel, setGuestLabel] = useState(
    card && !card.holder_user_id ? (card.holder_name ?? "") : ""
  )
  const [note, setNote] = useState(card?.note ?? "")

  const isGuest = holderUserId === NO_HOLDER
  const selectedMember = isGuest
    ? null
    : (members.find((m) => m.id === holderUserId) ?? null)

  const choice: HolderChoice = isGuest
    ? { kind: "guest", label: guestLabel }
    : {
        kind: "member",
        member: {
          id: holderUserId,
          name: selectedMember?.name ?? card?.holder_name ?? null,
        },
      }
  const derived = deriveHolder(choice)

  const cardIdError = mode === "add" ? validateCardId(cardId) : null
  const nameError = validateHolderName(derived.holder_name)
  const guestBytes = big5ByteLength(guestLabel.trim())

  // A member with no readable name can't be written to the controller, which
  // needs a label. Surface that instead of a blank "請輸入姓名".
  const memberNameError =
    !isGuest && nameError
      ? "這位成員的姓名無法寫進卡機，請改用「無成員（訪客）」自訂標籤。"
      : null

  const blocked = !!cardIdError || !!nameError

  function handleSubmit() {
    if (blocked) return
    onSubmit({
      card_id: cardId.trim(),
      holder_name: derived.holder_name,
      holder_user_id: derived.holder_user_id,
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
            ? "改動只存 Portal，改名才會同步到卡機。"
            : card
              ? "把這張卡再寫回卡機一次。"
              : "卡片會先寫進卡機，成功才會記到名單。"}
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
          {cardId.length > 0 && cardIdError && (
            <p className="text-xs text-destructive">{cardIdError}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="holder-user">持有人</Label>
          <MemberSelect
            id="holder-user"
            members={members}
            value={holderUserId}
            autoFocus={autoFocusHolder}
            onSelect={setHolderUserId}
          />
          {memberNameError && (
            <p className="text-xs text-destructive">{memberNameError}</p>
          )}
        </div>

        {isGuest && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="guest-label">姓名 / 標籤</Label>
            <Input
              id="guest-label"
              value={guestLabel}
              autoComplete="off"
              onChange={(e) => setGuestLabel(e.target.value)}
              placeholder="卡機上顯示的名字"
            />
            <p className="text-xs text-muted-foreground">
              最多 {HOLDER_NAME_MAX_BYTES} 位元組（中文 2、英數 1），目前{" "}
              {guestBytes}。
            </p>
            {guestLabel.length > 0 && nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="card-note">備註</Label>
          <Textarea
            id="card-note"
            value={note}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備用卡、借給誰…"
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
        <Button onClick={handleSubmit} disabled={pending || blocked}>
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
