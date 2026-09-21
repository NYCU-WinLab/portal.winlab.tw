"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { Badge } from "@workspace/ui/components/badge"

import { DOCUMENT_STATUS_LABEL } from "@/lib/approve/labels"
import type { ApproveDocument } from "@/lib/approve/types"

export function DocumentCard({
  href,
  title,
  subtitle,
  status,
  actions,
}: {
  href: string
  title: string
  subtitle?: string
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
              {DOCUMENT_STATUS_LABEL[status]}
            </Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </Link>
      {actions}
    </div>
  )
}
