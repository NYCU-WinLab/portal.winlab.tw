"use client"

import { IconPlus, IconX } from "@tabler/icons-react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
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
  HOLDER_NAME_MAX_BYTES,
  validateCardId,
  validateHolderName,
  type DoorCardView,
  type HolderGroup,
} from "@/lib/door/cards"

import { CardReader } from "./card-reader"
import { MemberSelect, NO_HOLDER } from "./member-select"

export type Member = { id: string; name: string | null; email: string | null }

export type HolderFormValues = {
  holderUserId: string | null
  holderName: string
  note: string | null
  cardIds: string[]
}

type HolderFormProps = {
  mode: "add" | "edit"
  group?: HolderGroup | null
  members: Member[]
  // Every enrolled card, so the reader can flag a tap that is already on the
  // list rather than offering to add it twice.
  allCards: DoorCardView[]
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: HolderFormValues) => void
}

// The fields live one level down so the dialog content can be keyed on the
// holder: Radix unmounts it when closed, which resets the form between two
// different holders without an effect copying props into state.
export function HolderFormDialog(props: HolderFormProps) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!props.pending) props.onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <HolderForm key={props.group?.key ?? "new"} {...props} />
      </DialogContent>
    </Dialog>
  )
}

function HolderForm({
  mode,
  group,
  members,
  allCards,
  pending,
  onOpenChange,
  onSubmit,
}: HolderFormProps) {
  const [holderUserId, setHolderUserId] = useState(
    group?.holderUserId ?? NO_HOLDER
  )
  // One 備註 field: for a member it is the optional note, for a guest it is the
  // required label that becomes both holder_name and note. A guest row stores
  // the label in note too, so fall back to the label when reopening one.
  const [noteText, setNoteText] = useState(
    group ? (group.note ?? (group.holderUserId ? "" : group.holderName)) : ""
  )
  const [cardIds, setCardIds] = useState<string[]>(
    group && group.cardIds.length > 0 ? group.cardIds : [""]
  )

  const isGuest = holderUserId === NO_HOLDER
  const selectedMember = isGuest
    ? null
    : (members.find((m) => m.id === holderUserId) ?? null)

  const holderName = isGuest
    ? noteText.trim()
    : (selectedMember?.name ?? group?.holderName ?? "").trim()

  const nameError = validateHolderName(holderName)
  // A member with no readable name can't be written to the controller, which
  // needs a label. Surface that instead of a blank "請輸入姓名".
  const memberNameError =
    !isGuest && nameError
      ? "這位成員的姓名無法寫進卡機，請改用「無成員（訪客）」自訂標籤。"
      : null
  const guestBytes = big5ByteLength(noteText.trim())

  const trimmedCards = cardIds.map((c) => c.trim()).filter((c) => c.length > 0)
  const uniqueCards = [...new Set(trimmedCards)]
  const hasDuplicate = uniqueCards.length !== trimmedCards.length
  const cardErrors = cardIds.map((c) =>
    c.trim().length > 0 ? validateCardId(c.trim()) : null
  )
  const anyCardError = cardErrors.some((e) => e !== null)
  const noCards = uniqueCards.length === 0

  const blocked = !!nameError || anyCardError || hasDuplicate || noCards

  function setCardAt(index: number, next: string) {
    setCardIds((prev) => prev.map((c, i) => (i === index ? next : c)))
  }

  function removeCardAt(index: number) {
    setCardIds((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== index)
    )
  }

  function addCardRow() {
    setCardIds((prev) => [...prev, ""])
  }

  // A scanned number fills the first empty row, or appends one. Duplicates are
  // dropped so tapping the same card twice doesn't add a second row.
  function appendScanned(cardNumber: string) {
    setCardIds((prev) => {
      if (prev.some((c) => c.trim() === cardNumber)) return prev
      const emptyIndex = prev.findIndex((c) => c.trim().length === 0)
      if (emptyIndex >= 0)
        return prev.map((c, i) => (i === emptyIndex ? cardNumber : c))
      return [...prev, cardNumber]
    })
  }

  function handleSubmit() {
    if (blocked) return
    onSubmit({
      holderUserId: isGuest ? null : holderUserId,
      holderName,
      note: noteText.trim() || null,
      cardIds: uniqueCards,
    })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {mode === "edit" ? "編輯持有人" : "新增持有人"}
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="holder-user">持有人</Label>
          <MemberSelect
            id="holder-user"
            members={members}
            value={holderUserId}
            onSelect={setHolderUserId}
          />
          {memberNameError && (
            <p className="text-xs text-destructive">{memberNameError}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="holder-note">備註</Label>
          <Textarea
            id="holder-note"
            value={noteText}
            rows={2}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={isGuest ? "卡機上顯示的名字" : "備用卡、借給誰…"}
          />
          {isGuest ? (
            <p className="text-xs text-muted-foreground">
              訪客請填卡機上顯示的名字，最多 {HOLDER_NAME_MAX_BYTES}{" "}
              位元組（中文 2、英數 1），目前 {guestBytes}。
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">選填。</p>
          )}
          {isGuest && noteText.trim().length > 0 && nameError && (
            <p className="text-xs text-destructive">{nameError}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>卡號</Label>
          <div className="flex flex-col gap-2">
            {cardIds.map((value, index) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={CARD_ID_LENGTH}
                    value={value}
                    onChange={(e) =>
                      setCardAt(index, e.target.value.replace(/[^0-9]/g, ""))
                    }
                    className="font-mono tabular-nums"
                    placeholder="0001234567"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={cardIds.length === 1}
                    onClick={() => removeCardAt(index)}
                    aria-label="移除這一列卡號"
                  >
                    <IconX className="size-4" />
                  </Button>
                </div>
                {value.trim().length > 0 && cardErrors[index] && (
                  <p className="text-xs text-destructive">
                    {cardErrors[index]}
                  </p>
                )}
              </div>
            ))}
          </div>
          {hasDuplicate && (
            <p className="text-xs text-destructive">卡號不能重複。</p>
          )}

          <CardReader
            cards={allCards}
            disabled={pending}
            onEnrol={appendScanned}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCardRow}
              disabled={pending}
            >
              <IconPlus className="size-4" />
              新增卡號
            </Button>
          </CardReader>
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
          {pending ? "處理中…" : "儲存"}
        </Button>
      </DialogFooter>
    </>
  )
}
