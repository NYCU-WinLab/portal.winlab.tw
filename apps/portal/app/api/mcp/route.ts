import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { after } from "next/server"

import { MCP_SERVER_INFO, registerTools } from "@/lib/mcp/server"
import { createUserClient, verifySupabaseToken } from "@/lib/mcp/supabase"
import { drainOutboxBatch } from "@/lib/receipts/email-drain"

// Remote MCP endpoint for portal. Auth is plain OAuth 2.1 against Supabase
// Auth (which in turn signs people in through Keycloak), so a tool call runs
// under the caller's own RLS just like the web app. The proxy skips /api, so
// this handler answers 401 + WWW-Authenticate itself via withMcpAuth.
export const maxDuration = 60

const handler = withMcpAuth(
  createMcpHandler(
    (server) =>
      registerTools(server, {
        // Same nudge the upload dialog gives: admins' uploads trigger the
        // notification drain right away, everyone else waits for the cron.
        afterReceiptUpload: (caller) => {
          after(async () => {
            try {
              const supabase = createUserClient(caller.token)
              const { data: ok } = await supabase.rpc("is_receipts_admin")
              if (ok) await drainOutboxBatch()
            } catch (err) {
              console.error("[mcp] receipt email drain failed", err)
            }
          })
        },
      }),
    {
      serverInfo: MCP_SERVER_INFO,
      instructions:
        "WinLab portal. Tools act as the signed-in member; receipts admins see everyone's receipts, others see their own.",
    }
  ),
  (_req, bearer) => verifySupabaseToken(bearer),
  { required: true }
)

export { handler as GET, handler as POST, handler as DELETE }
