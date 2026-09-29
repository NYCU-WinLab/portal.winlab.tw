import type { AuthInfo } from "@modelcontextprotocol/server"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"
import type { NormalizedUser } from "@/lib/user"

// Shared plumbing for every tool module under lib/mcp/tools/. A tool gets the
// caller from the verified bearer token, builds a per-request Supabase client
// with it (createUserClient) and answers with json() or failure().
export type ToolContext = { http?: { authInfo?: AuthInfo } }

export type Caller = {
  token: string
  userId: string
  email: string | null
  name: string | null
  keycloakSub: string | null
}

export function requireCaller(ctx: ToolContext): Caller {
  const auth = ctx.http?.authInfo
  if (!auth?.token) throw new Error("Unauthorized")
  const extra = auth.extra ?? {}
  return {
    token: auth.token,
    userId: typeof extra.userId === "string" ? extra.userId : auth.clientId,
    email: typeof extra.email === "string" ? extra.email : null,
    name: typeof extra.name === "string" ? extra.name : null,
    keycloakSub:
      typeof extra.keycloakSub === "string" ? extra.keycloakSub : null,
  }
}

// The SQL role checks an admin-only tool can ask for, and who they admit in
// the refusal. Each is the same function the app's RLS policies call.
const ADMIN_CHECKS = {
  is_portal_admin: "portal admins",
  is_reimburse_admin: "reimburse admins",
} as const

export type AdminCheck = keyof typeof ADMIN_CHECKS

// For tools whose web page only an app's admins reach. Checked up front so
// anyone else gets a plain refusal, not RLS's empty result.
export async function requireAdmin(
  supabase: SupabaseClient<Database>,
  check: AdminCheck,
  action: string
): Promise<void> {
  const { data, error } = await supabase.rpc(check)
  if (error) throw error
  if (data !== true) {
    throw new Error(`only ${ADMIN_CHECKS[check]} can ${action}`)
  }
}

// The caller in the shape the web's server actions pass around, with the
// same name fallback as normalizeUser.
export function callerAsUser(caller: Caller): NormalizedUser {
  return {
    id: caller.userId,
    email: caller.email,
    name: caller.name ?? caller.email ?? "Unknown",
    avatarUrl: null,
  }
}

export function json(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  }
}

// Supabase errors are plain objects, not Error instances, so String(err)
// would hand the agent "[object Object]" instead of the reason.
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null) {
    const { message, details, hint } = err as Record<string, unknown>
    const parts = [message, details, hint].filter(
      (part): part is string => typeof part === "string" && part.length > 0
    )
    if (parts.length > 0) return parts.join("; ")
    return JSON.stringify(err)
  }
  return String(err)
}

export function failure(err: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: errorMessage(err) }],
  }
}

// Tools that take a file get it as base64 in the arguments. Vercel rejects
// request bodies above ~4.5 MB and base64 inflates by a third, so each
// caller's maxBytes has to stay well under that.
export function decodeBase64(input: string, maxBytes: number): Uint8Array {
  const stripped = input.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "")
  if (!stripped) throw new Error("file_base64 is empty")
  if (!/^[A-Za-z0-9+/]+=*$/.test(stripped)) {
    throw new Error("file_base64 is not valid base64")
  }
  const bytes = new Uint8Array(Buffer.from(stripped, "base64"))
  if (bytes.byteLength === 0) throw new Error("file_base64 decoded to 0 bytes")
  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `file is ${bytes.byteLength} bytes; the limit is ${maxBytes}`
    )
  }
  return bytes
}

export const PORTAL_URL = "https://portal.winlab.tw"
