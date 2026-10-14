import Link from "next/link"
import { redirect } from "next/navigation"
import { Textarea } from "@workspace/ui/components/textarea"
import { developerSession, scopeRequests } from "@/lib/developers/queries"
import { createAdminClient } from "@/lib/supabase/admin"
import { databaseError } from "@/lib/developers/store"
import { ActionForm } from "../_components/action-form"
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const requestedPage = Number((await searchParams).page ?? 0)
  const page =
    Number.isSafeInteger(requestedPage) &&
    requestedPage >= 0 &&
    requestedPage < 10000
      ? requestedPage
      : 0
  if (!(await developerSession()).admin) redirect("/developers")
  const requests = await scopeRequests(undefined, page)
  const { data: apps, error } = await createAdminClient()
    .from("developer_apps")
    .select("id,name,contact_email,enabled")
    .order("created_at", { ascending: false })
    .limit(200)
  databaseError(error)
  const names = new Map(apps?.map((a) => [a.id, a.name]))
  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-medium">資料權限審核</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          確認應用由實驗室開發或維護、用途必要且有資料保護措施，再核准姓名與群組權限。
        </p>
      </header>
      <section className="space-y-5">
        <h2 className="font-medium">待審核</h2>
        {requests.length === 0 && (
          <p className="text-sm text-muted-foreground">目前沒有待審核申請。</p>
        )}
        {requests.map((r) => (
          <div key={r.id} className="space-y-4 rounded-lg border p-5">
            <Link
              className="font-medium underline underline-offset-4"
              href={`/developers/${r.app_id}`}
            >
              {names.get(r.app_id) ?? r.app_id}
            </Link>
            <p className="font-mono text-xs">{r.scopes.join(" · ")}</p>
            <p className="text-sm whitespace-pre-wrap">{r.purpose}</p>
            <ActionForm label="提交審核結果">
              <input type="hidden" name="operation" value="review" />
              <input type="hidden" name="id" value={r.id} />
              <select
                name="decision"
                aria-label="審核結果"
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="reject">拒絕</option>
                <option value="approve">核准</option>
              </select>
              <Textarea
                required
                name="review_note"
                aria-label="審核意見"
                placeholder="請填寫核准或拒絕的理由"
                maxLength={2000}
              />
            </ActionForm>
          </div>
        ))}
      </section>
      <nav aria-label="審核佇列分頁" className="flex gap-6 text-sm">
        {page > 0 && (
          <Link href={`/developers/review?page=${page - 1}`}>← 上一頁</Link>
        )}
        {requests.length === 50 && (
          <Link href={`/developers/review?page=${page + 1}`}>下一頁 →</Link>
        )}
      </nav>
      <section className="space-y-4">
        <h2 className="font-medium">最近 200 個應用程式</h2>
        <div className="divide-y rounded-lg border">
          {apps?.map((app) => (
            <Link
              key={app.id}
              href={`/developers/${app.id}`}
              className="flex justify-between gap-4 p-4 text-sm hover:bg-muted/50"
            >
              <div>
                {app.name}
                <p className="mt-1 text-xs text-muted-foreground">
                  {app.contact_email}
                </p>
              </div>
              <span>{app.enabled ? "可使用" : "已停用"}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
