"use client"

import type { ColumnDef, Row } from "@tanstack/react-table"
import { Pencil } from "lucide-react"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"

import type { Ingress, Reimbursement, Transaction } from "@/lib/reimburse/types"

import { DeleteEgressButton } from "./delete-egress-button"
import { EditEgressDialog } from "./edit-egress-dialog"
import { EditIngressDialog } from "./edit-ingress-dialog"

const dateFmt = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const twd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
})

const STATUS_LABEL: Record<Reimbursement["status"], string> = {
  pending: "待審核",
  approved: "已審核",
  rejected: "已拒絕",
}

function EditActionCell({ row }: { row: Row<Transaction> }) {
  const [open, setOpen] = useState(false)
  const data = row.original

  if (data.type === "egress") {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setOpen(true)}
          aria-label="編輯支出"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <EditEgressDialog
          open={open}
          onOpenChange={setOpen}
          data={data as Reimbursement}
        />
        <DeleteEgressButton id={data.id} itemName={data.itemName} />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        aria-label="編輯收入"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <EditIngressDialog
        open={open}
        onOpenChange={setOpen}
        data={data as Ingress}
      />
    </div>
  )
}

export function getUnifiedColumns(isAdmin: boolean): ColumnDef<Transaction>[] {
  const columns: ColumnDef<Transaction>[] = [
    {
      id: "date",
      header: () => <span>日期</span>,
      cell: ({ row }) => {
        const data = row.original
        const raw = data.type === "egress" ? data.invoiceDate : data.ingressDate
        return <span>{dateFmt.format(new Date(raw))}</span>
      },
    },
    {
      id: "applicant",
      header: () => <span>申請人</span>,
      cell: ({ row }) => {
        const data = row.original
        return <span>{data.type === "egress" ? data.applicantName : "—"}</span>
      },
    },
    {
      id: "amount",
      header: () => <span>金額</span>,
      cell: ({ row }) => {
        const data = row.original
        const amount =
          data.type === "egress" ? data.itemAmount : data.ingressAmount
        const sign = data.type === "egress" ? "-" : "+"
        return (
          <span
            className={
              data.type === "egress" ? "text-red-500" : "text-green-500"
            }
          >
            {sign}
            {twd.format(amount)}
          </span>
        )
      },
    },
    {
      id: "name",
      header: () => <span>名稱 / 備註</span>,
      cell: ({ row }) => {
        const data = row.original
        if (data.type === "egress") {
          return <span>{data.itemName}</span>
        }
        return (
          <span className="text-muted-foreground">
            {data.ingressComment ?? "—"}
          </span>
        )
      },
    },
    {
      id: "transferFee",
      header: () => <span>轉帳手續費</span>,
      cell: ({ row }) => {
        const data = row.original
        if (data.type === "egress" && data.transferFee !== null) {
          return (
            <span className="text-red-500">
              -{twd.format(data.transferFee)}
            </span>
          )
        }
        return <span className="text-muted-foreground">—</span>
      },
    },
    {
      id: "comment",
      header: () => <span>備註</span>,
      cell: ({ row }) => {
        const data = row.original
        if (data.type === "egress") {
          return (
            <span className="text-muted-foreground">
              {data.itemComment ?? "—"}
            </span>
          )
        }
        return <span className="text-muted-foreground">—</span>
      },
    },
    {
      id: "transferDate",
      header: () => <span>轉帳日期</span>,
      cell: ({ row }) => {
        const data = row.original
        if (data.type === "egress" && data.transferDate) {
          return <span>{dateFmt.format(new Date(data.transferDate))}</span>
        }
        return <span className="text-muted-foreground">—</span>
      },
    },
    {
      id: "status",
      header: () => <span>狀態</span>,
      cell: ({ row }) => {
        const data = row.original
        if (data.type === "egress") {
          return <span>{STATUS_LABEL[data.status]}</span>
        }
        return <span className="text-muted-foreground">—</span>
      },
    },
  ]

  if (isAdmin) {
    columns.push({
      id: "actions",
      header: () => <span>操作</span>,
      cell: ({ row }) => <EditActionCell row={row} />,
      enableSorting: false,
      enableHiding: false,
    })
  }

  return columns
}
