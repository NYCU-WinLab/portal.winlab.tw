import type { AuthInfo } from "@modelcontextprotocol/server"

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

export const PORTAL_URL = "https://portal.winlab.tw"
