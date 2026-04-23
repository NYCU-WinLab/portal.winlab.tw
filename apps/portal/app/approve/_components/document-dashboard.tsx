"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { IconDots } from "@tabler/icons-react"
import Link from "next/link"

import { useAuth } from "@/hooks/use-auth"
import {
  useInboxDocuments,
  useSentDocuments,
  useSignedDocuments,
} from "@/hooks/approve/use-documents"
import { useInboxCount } from "@/hooks/approve/use-inbox-count"
import { queryKeys } from "@/hooks/approve/query-keys"

import { deleteDocument } from "../actions"

import { ConfirmDialog } from "./confirm-dialog"
import { DocumentCard } from "./document-card"

export function DocumentDashboard() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [tab, setTab] = useState("inbox")
  const queryClient = useQueryClient()

  const inboxCount = useInboxCount(userId)
  const inbox = useInboxDocuments(userId)
  const signed = useSignedDocuments(userId)
  const sent = useSentDocuments(userId)

  async function onDelete(documentId: string) {
    try {
      await deleteDocument(documentId)
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents.all })
      toast.success("已刪除")
    } catch (e) {
      console.error("[approve] deleteDocument failed", { documentId, e })
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">Approve</h1>
          <p className="text-sm text-muted-foreground">
            文件簽核：上傳 PDF、指派 signer、追蹤進度。
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/approve/new">送簽</Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
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

        <TabsContent value="inbox" className="flex flex-col gap-3">
          {(inbox.data ?? []).length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              沒有待簽文件
            </p>
          ) : (
            (inbox.data ?? []).map((row) => (
              <DocumentCard
                key={row.id}
                href={`/approve/sign/${row.document_id}`}
                title={row.document.title}
                subtitle={`送簽：${row.document.creator?.name ?? "?"} · ${row.created_at.slice(0, 10)}`}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="signed" className="flex flex-col gap-3">
          {(signed.data ?? []).length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              還沒簽過任何文件
            </p>
          ) : (
            (signed.data ?? []).map((row) => (
              <DocumentCard
                key={row.id}
                href={`/approve/view/${row.document_id}`}
                title={row.document.title}
                subtitle={`簽於 ${row.signed_at?.slice(0, 10) ?? ""}`}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="sent" className="flex flex-col gap-3">
          {(sent.data ?? []).length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              還沒送過任何文件
            </p>
          ) : (
            (sent.data ?? []).map((doc) => {
              const isDraft = doc.status === "draft"
              const isPending = doc.status === "pending"
              const canRemove = isDraft || isPending
              const label = isDraft ? "刪除草稿" : "撤回送簽"
              const dialogTitle = isDraft ? "刪除草稿？" : "撤回送簽？"
              const dialogDesc = isDraft
                ? "刪了就沒了。"
                : "文件會直接刪除，signer 的代簽會消失。"
              return (
                <DocumentCard
                  key={doc.id}
                  href={
                    isDraft
                      ? `/approve/new/${doc.id}`
                      : `/approve/view/${doc.id}`
                  }
                  title={doc.title}
                  subtitle={`更新於 ${doc.updated_at.slice(0, 10)}`}
                  status={doc.status}
                  actions={
                    canRemove ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 shrink-0"
                            aria-label="actions"
                          >
                            <IconDots className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <ConfirmDialog
                            trigger={
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={(e) => e.preventDefault()}
                              >
                                {label}
                              </DropdownMenuItem>
                            }
                            title={dialogTitle}
                            description={dialogDesc}
                            confirmText="刪除"
                            variant="destructive"
                            onConfirm={() => onDelete(doc.id)}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null
                  }
                />
              )
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
