import { cookies } from "next/headers"
import { ZodError, z } from "zod"

import { validateOAuthClientRequest } from "@/lib/auth/oauth-request"
import { getMcpResourceUrl } from "@/lib/auth/urls"

// Stashes the MCP authorize-request parameters in an httpOnly cookie so the
// redirect back from Supabase/Keycloak can stay query-string clean. Supabase
// matches redirectTo against the Redirect URLs allowlist with exact path; a
// query string on the redirect causes a fallback to Site URL. Using a cookie
// sidesteps that entirely.
const prepareBodySchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(1),
  state: z.string().optional(),
  resource: z.string().url().optional(),
})

export const MCP_OAUTH_STATE_COOKIE = "mcp_oauth_state"

export async function POST(request: Request) {
  let body: z.infer<typeof prepareBodySchema>
  try {
    body = prepareBodySchema.parse(await request.json())
    await validateOAuthClientRequest(
      {
        clientId: body.client_id,
        redirectUri: body.redirect_uri,
        resource: body.resource,
      },
      { expectedResource: getMcpResourceUrl() }
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "invalid_request",
          error_description: error.issues.map((i) => i.message).join(", "),
        },
        { status: 400 }
      )
    }
    return Response.json(
      {
        error: "invalid_request",
        error_description:
          error instanceof Error ? error.message : "Invalid MCP request",
      },
      { status: 400 }
    )
  }

  const cookieStore = await cookies()
  cookieStore.set(MCP_OAUTH_STATE_COOKIE, JSON.stringify(body), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })

  return Response.json({ ok: true })
}
