"use client"

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { DeleteReceiptDialog } from "./delete-receipt-dialog"
import { EditReceiptDialog } from "./edit-receipt-dialog"

export function ReceiptRowActions({
  id,
  name,
  path,
}: {
  id: string
  name: string
  path: string
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`動作 — ${name}`}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            編輯名稱
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" />
            刪除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && (
        <EditReceiptDialog
          id={id}
          name={name}
          onClose={() => setEditOpen(false)}
        />
      )}
      <DeleteReceiptDialog
        id={id}
        name={name}
        path={path}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}
