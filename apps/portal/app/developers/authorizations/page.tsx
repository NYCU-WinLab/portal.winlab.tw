import { myGrants } from "@/lib/developers/queries"
import { SCOPES, type Scope } from "@/lib/developers/policy"
import { ActionForm } from "../_components/action-form"
export default async function AuthorizationsPage() {
  const grants = await myGrants()
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-medium">我的授權</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          查看哪些應用程式可以取得你的資料。撤銷後，該次授權的存取與更新 token
          會立即失效；應用程式應刪除先前取得的授權資料。
        </p>
      </header>
      {grants.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          你目前沒有有效的應用程式授權。
        </p>
      )}
      {grants.map((g) => (
        <section key={g.id} className="space-y-4 rounded-lg border p-5">
          <h2 className="font-medium">{g.developer_apps.name}</h2>
          <p className="text-sm text-muted-foreground">
            {g.scopes.map((s) => SCOPES[s as Scope]?.label ?? s).join("、")}
          </p>
          <p className="text-xs text-muted-foreground">
            授權至{" "}
            {new Date(g.expires_at).toLocaleDateString("zh-TW", {
              timeZone: "Asia/Taipei",
            })}
          </p>
          <ActionForm
            label="撤銷此授權"
            confirmation="此操作會立即撤銷相關授權，應用程式將無法繼續存取資料。"
          >
            <input type="hidden" name="operation" value="revoke-grant" />
            <input type="hidden" name="id" value={g.id} />
          </ActionForm>
        </section>
      ))}
    </div>
  )
}
