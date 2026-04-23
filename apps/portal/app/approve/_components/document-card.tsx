"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { Badge } from "@workspace/ui/components/badge"

import type { ApproveDocument, DocumentStatus } from "@/lib/approve/types"

const STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: "草稿",
  pending: "送簽中",
  completed: "已完成",
  cancelled: "已取消",
}

export function DocumentCard({
  href,
  title,
  subtitle,
  status,
  actions,
}: {
  href: string
  title: string
  subtitle: string
  status?: ApproveDocument["status"]
  actions?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent">
      <Link href={href} className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {status && (
            <Badge variant="outline" className="text-xs">
              {STATUS_LABEL[status]}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </Link>
      {actions}
    </div>
  )
}
