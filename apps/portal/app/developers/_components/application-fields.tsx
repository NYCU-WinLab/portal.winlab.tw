import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"
import type { Application } from "@/lib/developers/types"

export function ApplicationFields({
  app,
}: {
  app?: Omit<Application, "secret_hash">
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="name">應用程式名稱</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={100}
          defaultValue={app?.name}
          placeholder="例如：實驗室設備借用"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">服務用途與負責單位</Label>
        <Textarea
          id="description"
          name="description"
          required
          maxLength={2000}
          defaultValue={app?.description}
          placeholder="說明服務功能、維護者與使用對象"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact_email">維護者聯絡 Email</Label>
        <Input
          id="contact_email"
          name="contact_email"
          type="email"
          required
          defaultValue={app?.contact_email}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="privacy_url">隱私政策網址</Label>
        <Input
          id="privacy_url"
          name="privacy_url"
          type="url"
          required
          defaultValue={app?.privacy_url}
          placeholder="https://example.org/privacy"
        />
      </div>
      {!app && (
        <div className="space-y-2">
          <Label htmlFor="client_type">應用程式類型</Label>
          <select
            id="client_type"
            name="client_type"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="public">Public · 瀏覽器 / SPA（無 secret）</option>
            <option value="confidential">Confidential · 有後端伺服器</option>
          </select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="redirect_uris">Redirect URIs</Label>
        <Textarea
          id="redirect_uris"
          name="redirect_uris"
          required
          defaultValue={app?.redirect_uris.join("\n")}
          placeholder="https://example.org/callback"
        />
        <p className="text-xs text-muted-foreground">
          一行一個完整網址，最多 10 個。需 HTTPS；本機測試可使用 HTTP
          localhost。變更後會撤銷既有授權。
        </p>
      </div>
    </>
  )
}
