import Link from "next/link"
import { SCOPES } from "@/lib/developers/policy"
function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/30 p-4 font-mono text-xs leading-6">
      {children}
    </pre>
  )
}
export default function DocumentationPage() {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL || "https://portal.winlab.tw"
  ).replace(/\/$/, "")
  return (
    <article className="space-y-10 text-sm leading-7">
      <header className="space-y-3">
        <p className="font-mono text-xs tracking-widest text-muted-foreground">
          WINLAB / DEVELOPER GUIDE
        </p>
        <h1 className="text-3xl font-medium tracking-tight">
          串接 WinLab 登入
        </h1>
        <p className="text-muted-foreground">
          使用 OAuth 2.0 Authorization Code 與
          PKCE（S256），在成員同意的範圍內取得資料。
        </p>
      </header>
      <section id="mcp" className="space-y-3 rounded-lg border p-5">
        <h2 className="text-lg font-medium">讓 AI 協助串接 / MCP</h2>
        <p>在支援遠端 MCP 的 AI 工具新增以下網址，並透過 Portal 登入：</p>
        <Code>{`${base}/api/mcp`}</Code>
        <p>
          可以請 AI
          列出自己的應用、註冊新應用、提交資料權限申請，以及取得回呼網址與 OAuth
          串接資訊。
        </p>
        <Code>{`list_developer_apps
get_developer_app
register_developer_app
request_developer_scopes
get_developer_integration`}</Code>
        <p className="text-muted-foreground">
          註冊前需確認用途、隱私政策與資料使用規範。Confidential secret
          只顯示一次，請存入後端環境變數。name / groups
          仍需管理員審核及成員同意。此 MCP 使用 Portal
          登入，不能使用你的應用取得的 access token。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">01 / 註冊你的應用</h2>
        <p>
          在
          <Link href="/developers" className="underline underline-offset-4">
            開發者首頁
          </Link>
          填寫用途、維護者、隱私政策與完整回呼網址。瀏覽器應用選
          Public；有後端的應用可選 Confidential，將 secret
          存放在後端環境變數。每個應用使用自己的 Client ID。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">02 / 申請最少必要資料</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b">
              <tr>
                <th className="py-2">Scope</th>
                <th>資料</th>
                <th>審核</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(SCOPES).map(([key, value]) => (
                <tr key={key} className="border-b">
                  <td className="py-3 font-mono">{key}</td>
                  <td>{value.label}</td>
                  <td>
                    {value.restricted ? "管理員核准 + 成員同意" : "成員同意"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground">
          姓名與群組需填寫用途並經審核。status 尚未開放；未知或未核准的 scope
          會被拒絕。這是 OAuth 資料授權服務，不發行 OIDC ID token。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">03 / 導向授權畫面</h2>
        <p>
          每次產生新的隨機 state 與 code_verifier，暫存於使用者的 session。將
          verifier 的 SHA-256 雜湊轉成 base64url，作為 code_challenge。
        </p>
        <Code>{`const verifier = crypto.randomBytes(32).toString("base64url")
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url")
const state = crypto.randomBytes(32).toString("base64url")
// Save verifier and state in the user's server session.
const query = new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: "profile groups", // groups requires approval
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
})
const authorizationUrl = "${base}/developers/authorize?" + query`}</Code>
        <p>
          成員同意後，回呼收到 code 與 state；拒絕時收到
          error=access_denied。先驗證 state 與 session
          內保存的值完全相同，再交換授權碼。每個 code 有效 2
          分鐘且只能使用一次。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">04 / 換取 token</h2>
        <Code>{`POST ${base}/api/developers/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id=YOUR_CLIENT_ID
&code=AUTHORIZATION_CODE
&redirect_uri=YOUR_EXACT_REDIRECT_URI
&code_verifier=YOUR_SAVED_VERIFIER
# Confidential clients additionally send client_secret.
# URL-encode every parameter using URLSearchParams.`}</Code>
        <p>
          回傳 access_token、refresh_token、expires_in、scope 與
          token_type。Access token 有效 10 分鐘；授權最長 30
          天。服務每次檢查授權是否仍有效，撤銷後無法繼續使用。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">05 / 取得本人資料</h2>
        <Code>{`GET ${base}/api/developers/profile
Authorization: Bearer ACCESS_TOKEN

{ "username": "member", "email": "member@example.org" }

GET ${base}/api/developers/name
{ "username": "member", "name": "成員姓名" }

GET ${base}/api/developers/groups
{ "username": "member", "groups": ["114", "master", "cairn", "wnc-easymesh"] }`}</Code>
        <p>
          每個端點都需要對應 scope 與 Authorization header。groups 只包含
          /lab-member/ 與 /winlab-projects/ 下的直接群組名稱；master
          是成員身分，不是管理員權限。資料來源暫時失敗時回傳
          503，不能視為成員沒有群組。
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">06 / 更新與撤銷</h2>
        <Code>{`POST ${base}/api/developers/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&client_id=YOUR_CLIENT_ID&refresh_token=REFRESH_TOKEN
# Confidential clients additionally send client_secret.

POST ${base}/api/developers/oauth/revoke
Content-Type: application/x-www-form-urlencoded

client_id=YOUR_CLIENT_ID&token=ACCESS_OR_REFRESH_TOKEN
# Confidential clients additionally send client_secret.`}</Code>
        <p>
          更新後必須保存新的 refresh token，舊 token pair
          立即失效；請避免並行更新；重複使用舊 refresh token
          會撤銷整次授權，需重新登入並同意。撤銷會終止該次授權，未知 token
          也回傳 200。成員也可從
          <Link
            href="/developers/authorizations"
            className="underline underline-offset-4"
          >
            我的授權
          </Link>
          撤銷。
        </p>
      </section>
      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-medium">資料使用約定</h2>
        <p>
          僅取得服務必要資料，不得擴大用途、離線保存機敏資料或轉交
          token。使用者撤銷後，應刪除已取得的授權資料。應用需提供聯絡窗口與隱私政策；管理員可撤除機敏權限或停用違規應用。
        </p>
        <p className="text-muted-foreground">
          權限規則參考{" "}
          <a href="https://id.nycu.edu.tw/docs/" className="underline">
            NYCU 開發者文件
          </a>
          與
          <a href="https://id.nycu.edu.tw/policy/" className="underline">
            使用條款
          </a>
          ，groups 是 WinLab 新增的受限範圍。
        </p>
      </section>
    </article>
  )
}
