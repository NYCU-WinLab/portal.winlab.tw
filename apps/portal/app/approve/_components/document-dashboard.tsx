"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { IconPlus } from "@tabler/icons-react"
import Link from "next/link"

import { useAuth } from "@/hooks/use-auth"
import {
  useInboxDocuments,
  useSentDocuments,
  useSignedDocuments,
} from "@/hooks/approve/use-documents"
import { useInboxCount } from "@/hooks/approve/use-inbox-count"

import { DocumentCard } from "./document-card"

export function DocumentDashboard() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [tab, setTab] = useState("inbox")

  const inboxCount = useInboxCount(userId)
  const inbox = useInboxDocuments(userId)
  const signed = useSignedDocuments(userId)
  const sent = useSentDocuments(userId)

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Approve</h1>
        <Button asChild>
          <Link href="/approve/new">
            <IconPlus className="size-4" />
            送簽
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="inbox">
            代簽
            {(inboxCount.data ?? 0) > 0 && (
              <span className="ml-2 rounded bg-primary/20 px-1.5 text-xs tabular-nums">
                {inboxCount.data}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="signed">已簽</TabsTrigger>
          <TabsTrigger value="sent">送簽</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="space-y-2">
          {(inbox.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">沒有待簽文件</p>
          )}
          {(inbox.data ?? []).map((row) => (
            <DocumentCard
              key={row.id}
              href={`/approve/sign/${row.document_id}`}
              title={row.document.title}
              subtitle={`送簽：${row.document.creator?.name ?? "?"} · ${row.created_at.slice(0, 10)}`}
            />
          ))}
        </TabsContent>

        <TabsContent value="signed" className="space-y-2">
          {(signed.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">還沒簽過任何文件</p>
          )}
          {(signed.data ?? []).map((row) => (
            <DocumentCard
              key={row.id}
              href={`/approve/view/${row.document_id}`}
              title={row.document.title}
              subtitle={`簽於 ${row.signed_at?.slice(0, 10) ?? ""}`}
            />
          ))}
        </TabsContent>

        <TabsContent value="sent" className="space-y-2">
          {(sent.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">還沒送過任何文件</p>
          )}
          {(sent.data ?? []).map((doc) => (
            <DocumentCard
              key={doc.id}
              href={
                doc.status === "draft"
                  ? `/approve/new/${doc.id}`
                  : `/approve/view/${doc.id}`
              }
              title={doc.title}
              subtitle={`更新於 ${doc.updated_at.slice(0, 10)}`}
              status={doc.status}
            />
          ))}
        </TabsContent>
      </Tabs>
    </main>
  )
}
