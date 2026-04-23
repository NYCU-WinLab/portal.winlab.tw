"use client"

import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"
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
}: {
  href: string
  title: string
  subtitle: string
  status?: ApproveDocument["status"]
}) {
  return (
    <Link href={href} className="block">
      <Card className="group space-y-1 p-4 transition-colors hover:bg-muted/40">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{title}</h3>
          {status && <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </Card>
    </Link>
  )
}
