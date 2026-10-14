import Link from "next/link"
import { Badge } from "@workspace/ui/components/badge"
import { developerSession, myApplications } from "@/lib/developers/queries"
import { ActionForm } from "./_components/action-form"
import { ApplicationFields } from "./_components/application-fields"
export default async function DevelopersPage() {
  const { admin } = await developerSession()
  const apps = await myApplications()
  return (
    <div className="space-y-12">
      <header className="space-y-4 border-b pb-8">
        <p className="font-mono text-xs tracking-widest text-muted-foreground">
          WINLAB / IDENTITY
        </p>
        <h1 className="text-3xl font-medium tracking-tight text-balance">
          一個帳號，串起你的應用。
        </h1>
        <p className="max-w-xl text-sm leading-7 text-muted-foreground">
          讓實驗室成員使用 WinLab
          帳號登入你的服務。註冊應用、申請必要的資料範圍，再由成員決定是否授權。
        </p>
        <div className="flex gap-6 text-sm">
          <Link
            href="/developers/docs"
            className="underline underline-offset-4"
          >
            閱讀串接文件 →
          </Link>
          {admin && (
            <Link
              href="/developers/review"
              className="underline underline-offset-4"
            >
              管理員審核 →
            </Link>
          )}
        </div>
      </header>
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">我的應用程式</h2>
          <span className="font-mono text-xs text-muted-foreground">
            {String(apps.length).padStart(2, "0")}
          </span>
        </div>
        {apps.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            還沒有應用程式。從下方註冊你的第一個服務。
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {apps.map((app) => (
              <Link
                key={app.id}
                href={`/developers/${app.id}`}
                className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{app.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {app.description}
                  </p>
                </div>
                <Badge variant={app.enabled ? "secondary" : "outline"}>
                  {app.enabled ? app.client_type : "已停用"}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-6 border-t pt-8">
        <div>
          <h2 className="font-medium">註冊應用程式</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            基本權限包含帳號與 Email。姓名與群組需另外申請，經管理員核准後使用。
          </p>
        </div>
        <ActionForm label="建立應用程式">
          <input type="hidden" name="operation" value="create" />
          <ApplicationFields />
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input type="checkbox" required className="mt-1" />
            我會依用途使用必要資料、妥善保管憑證，並在使用者撤銷授權後刪除其授權資料。
          </label>
        </ActionForm>
      </section>
    </div>
  )
}
