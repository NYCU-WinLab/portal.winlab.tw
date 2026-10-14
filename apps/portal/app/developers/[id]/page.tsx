import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"
import { Textarea } from "@workspace/ui/components/textarea"
import { SCOPES } from "@/lib/developers/policy"
import {
  developerSession,
  ownedApplication,
  scopeRequests,
} from "@/lib/developers/queries"
import { ActionForm } from "../_components/action-form"
import { ApplicationFields } from "../_components/application-fields"
export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const app = await ownedApplication(id)
  if (!app) notFound()
  const { admin, user } = await developerSession()
  const requests = await scopeRequests(id)
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <Link href="/developers" className="text-xs text-muted-foreground">
          ← 我的應用程式
        </Link>
        <h1 className="text-2xl font-medium">{app.name}</h1>
        <p className="text-sm text-muted-foreground">
          {app.enabled ? "可使用" : "已停用"} · {app.client_type}
        </p>
        <div className="rounded-lg border p-4">
          <p className="mb-2 text-xs text-muted-foreground">CLIENT ID</p>
          <code className="text-sm break-all select-all">{app.id}</code>
        </div>
      </header>
      <section className="space-y-4">
        <h2 className="font-medium">已核准的資料範圍</h2>
        <div className="flex flex-wrap gap-2">
          {app.approved_scopes.map((s) => (
            <code key={s} className="rounded border px-3 py-1 text-sm">
              {s}
            </code>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          取得資料仍需成員本人同意。Client secret 不會再次顯示。
        </p>
      </section>
      <details className="rounded-lg border p-5">
        <summary className="cursor-pointer text-sm font-medium">
          編輯應用程式資訊
        </summary>
        <div className="pt-6">
          <ActionForm label="儲存設定">
            <input type="hidden" name="operation" value="update" />
            <input type="hidden" name="id" value={id} />
            <ApplicationFields app={app} />
          </ActionForm>
        </div>
      </details>
      {user.id === app.owner_id && (
        <section className="space-y-4">
          <h2 className="font-medium">申請機敏資料權限</h2>
          <ActionForm label="送出審核">
            <input type="hidden" name="operation" value="request" />
            <input type="hidden" name="id" value={id} />
            <div className="flex gap-6">
              {(["name", "groups"] as const).map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope}
                    disabled={app.approved_scopes.includes(scope)}
                  />
                  {SCOPES[scope].label}
                </label>
              ))}
            </div>
            <Textarea
              name="purpose"
              aria-label="資料使用目的"
              required
              minLength={10}
              maxLength={2000}
              placeholder="說明必要性、使用方式、負責人與資料刪除方式（至少 10 字）"
            />
          </ActionForm>
        </section>
      )}
      {requests.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">申請紀錄</h2>
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border p-4 text-sm">
              <p>
                {r.scopes.join(" · ")} —{" "}
                {
                  { pending: "待審核", approved: "已核准", rejected: "已拒絕" }[
                    r.status
                  ]
                }
              </p>
              <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                {r.purpose}
              </p>
              {r.review_note && (
                <p className="mt-2">審核意見：{r.review_note}</p>
              )}
            </div>
          ))}
        </section>
      )}
      <section className="space-y-6 border-t pt-6">
        <h2 className="font-medium">憑證與存取控制</h2>
        <p className="text-sm text-muted-foreground">
          以下操作會撤銷既有授權，成員需要重新同意。停用後只有管理員能重新啟用。
        </p>
        {app.client_type === "confidential" && (
          <ActionForm
            label="更新 Client secret"
            confirmation="此操作會立即撤銷相關授權，應用程式將無法繼續存取資料。"
          >
            <input type="hidden" name="operation" value="rotate" />
            <input type="hidden" name="id" value={id} />
          </ActionForm>
        )}
        {app.enabled && (
          <ActionForm
            label="停用應用程式"
            confirmation="此操作會立即撤銷相關授權，應用程式將無法繼續存取資料。"
          >
            <input type="hidden" name="operation" value="disable" />
            <input type="hidden" name="id" value={id} />
          </ActionForm>
        )}
        {admin && !app.enabled && (
          <ActionForm label="重新啟用">
            <input type="hidden" name="operation" value="enable" />
            <input type="hidden" name="id" value={id} />
          </ActionForm>
        )}
        {admin && app.approved_scopes.length > 1 && (
          <ActionForm
            label="撤除機敏資料權限"
            confirmation="此操作會立即撤銷相關授權，應用程式將無法繼續存取資料。"
          >
            <input type="hidden" name="operation" value="revoke-scopes" />
            <input type="hidden" name="id" value={id} />
          </ActionForm>
        )}
      </section>
    </div>
  )
}
