import { Button } from "@workspace/ui/components/button"
import {
  developerSession,
  authorizationDetails,
} from "@/lib/developers/queries"
import { SCOPES } from "@/lib/developers/policy"
import { decideAuthorization } from "./actions"
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await developerSession()
  let details: Awaited<ReturnType<typeof authorizationDetails>>
  try {
    details = await authorizationDetails(await searchParams)
  } catch {
    return (
      <div role="alert" className="space-y-3 rounded-lg border p-6">
        <h1 className="font-medium">無法授權此應用程式</h1>
        <p className="text-sm text-muted-foreground">
          請確認應用程式、回呼網址、PKCE
          與申請的資料範圍有效。基於安全考量，此頁不會跳轉至未驗證的網址。
        </p>
      </div>
    )
  }
  const { app, input, scopes } = details
  return (
    <div className="mx-auto max-w-lg space-y-8 py-8">
      <header className="space-y-4">
        <p className="font-mono text-xs tracking-widest text-muted-foreground">
          WINLAB / CONSENT
        </p>
        <h1 className="text-2xl font-medium">授權 {app.name}</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          此應用程式想要取得你的下列資料。只有你同意後，服務才會提供資料。
        </p>
      </header>
      <div className="divide-y rounded-lg border">
        {scopes.map((s) => (
          <div key={s} className="space-y-1 p-4">
            <p className="text-sm font-medium">{SCOPES[s].label}</p>
            <p className="text-sm text-muted-foreground">
              {SCOPES[s].description}
            </p>
          </div>
        ))}
      </div>
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>{app.description}</p>
        <p>維護者：{app.contact_email}</p>
        <a
          href={app.privacy_url}
          rel="noopener noreferrer"
          target="_blank"
          className="underline underline-offset-4"
        >
          隱私政策 ↗
        </a>
        <p className="pt-2 break-all">
          授權後返回：{new URL(input.redirect_uri).origin}
        </p>
        <p>授權最長 30 天，可隨時在「我的授權」撤銷。</p>
      </div>
      <form
        action={decideAuthorization.bind(null, input)}
        className="flex gap-3"
      >
        <Button name="decision" value="deny" variant="outline">
          拒絕
        </Button>
        <Button name="decision" value="approve">
          同意並繼續
        </Button>
      </form>
    </div>
  )
}
