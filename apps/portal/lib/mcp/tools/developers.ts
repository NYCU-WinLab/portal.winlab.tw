import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"
import { applicationInput, SCOPES } from "@/lib/developers/policy"
import {
  registerApplicationFor,
  requestScopesFor,
  scopeRequestInput,
} from "@/lib/developers/mutations"
import { APP_COLUMNS, databaseError } from "@/lib/developers/store"
import {
  json,
  failure,
  requireCaller,
  PORTAL_URL,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"

async function ownApplication(ctx: ToolContext, id: string) {
  const caller = requireCaller(ctx)
  const db = createUserClient(caller.token)
  const { data, error } = await db
    .from("developer_apps")
    .select(APP_COLUMNS)
    .eq("id", id)
    .eq("owner_id", caller.userId)
    .maybeSingle()
  databaseError(error)
  if (!data) throw new Error("找不到應用程式或你不是擁有者。")
  return { app: data, db }
}
const appIdInput = z.object({ app_id: z.uuid() })
const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
}

export function registerDeveloperTools(server: McpServer) {
  server.registerTool(
    "list_developer_apps",
    {
      title: "List my applications",
      description:
        "List applications owned by the signed-in member, including client IDs, redirect URIs, approved scopes and status. Only the caller's applications, even for Portal administrators. Never includes client secrets, secret hashes or member tokens.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    async (_args, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const { data, error } = await createUserClient(caller.token)
          .from("developer_apps")
          .select(APP_COLUMNS)
          .eq("owner_id", caller.userId)
          .order("created_at", { ascending: false })
        databaseError(error)
        return json({ applications: data, url: `${PORTAL_URL}/developers` })
      } catch (error) {
        return failure(error)
      }
    }
  )
  server.registerTool(
    "get_developer_app",
    {
      title: "Get my application",
      description:
        "Read one application owned by the signed-in member and its latest 100 scope review requests. Shows whether name/groups approval is pending, approved or rejected. Does not expose secrets or grants belonging to members who use the application.",
      inputSchema: appIdInput,
      annotations: readOnly,
    },
    async ({ app_id }, ctx) => {
      try {
        const { app, db } = await ownApplication(ctx as ToolContext, app_id)
        const { data, error } = await db
          .from("developer_scope_requests")
          .select("*")
          .eq("app_id", app_id)
          .order("created_at", { ascending: false })
          .limit(100)
        databaseError(error)
        return json({
          application: app,
          requests: data,
          url: `${PORTAL_URL}/developers/${app_id}`,
        })
      } catch (error) {
        return failure(error)
      }
    }
  )
  server.registerTool(
    "register_developer_app",
    {
      title: "Register an application",
      description:
        "Register an application owned by the signed-in member, using the same validation and 20-app limit as /developers. Confirm the supplied name, purpose, contact, HTTPS privacy policy, exact redirects, client type and data-use terms with the member first. accept_terms must be true. Confidential clients return a secret exactly once: save it only in the intended server-side secret store, never source control or frontend code. Public clients have no secret. New apps only have profile; name/groups need separate review and member consent.",
      inputSchema: applicationInput.extend({
        accept_terms: z
          .literal(true)
          .describe(
            "The member explicitly accepted minimal data use, privacy and revocation obligations"
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const result = await registerApplicationFor(caller.userId, input)
        return json({
          ...result,
          url: `${PORTAL_URL}/developers/${result.id}`,
          secret_notice: result.secret
            ? "Shown once. Store server-side only."
            : undefined,
        })
      } catch (error) {
        return failure(error)
      }
    }
  )
  server.registerTool(
    "request_developer_scopes",
    {
      title: "Request application data access",
      description:
        "Submit a name/groups scope request for an application owned by the signed-in member. Requires the member's concrete purpose and consent to submit. Only one pending request is allowed per application. Submission does not approve the scopes: a Portal administrator must review, and the end user must still consent during login. No Keycloak settings are changed.",
      inputSchema: scopeRequestInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        await requestScopesFor(
          createUserClient(caller.token),
          caller.userId,
          input
        )
        return json({
          status: "pending",
          url: `${PORTAL_URL}/developers/${input.app_id}`,
        })
      } catch (error) {
        return failure(error)
      }
    }
  )
  server.registerTool(
    "get_developer_integration",
    {
      title: "Get application integration information",
      description:
        "Get OAuth endpoints, exact registered redirects, approved scopes, field definitions, PKCE requirements and lifetimes for an application owned by the signed-in member. Use these to implement Authorization Code + S256 PKCE. This is not an OIDC issuer; no ID token is issued. Secrets and member tokens are never returned by this tool.",
      inputSchema: appIdInput,
      annotations: readOnly,
    },
    async ({ app_id }, ctx) => {
      try {
        const { app } = await ownApplication(ctx as ToolContext, app_id)
        return json({
          client_id: app.id,
          client_type: app.client_type,
          enabled: app.enabled,
          redirect_uris: app.redirect_uris,
          approved_scopes: app.approved_scopes,
          pkce_required: true,
          code_challenge_method: "S256",
          state_required: true,
          grant_types: ["authorization_code", "refresh_token"],
          endpoints: {
            authorize: `${PORTAL_URL}/developers/authorize`,
            token: `${PORTAL_URL}/api/developers/oauth/token`,
            revoke: `${PORTAL_URL}/api/developers/oauth/revoke`,
            profile: `${PORTAL_URL}/api/developers/profile`,
            name: `${PORTAL_URL}/api/developers/name`,
            groups: `${PORTAL_URL}/api/developers/groups`,
          },
          scopes: SCOPES,
          authorization_code_seconds: 120,
          access_token_seconds: 600,
          max_grant_days: 30,
          refresh_rotation:
            "Every refresh rotates tokens; reuse revokes the entire grant. Persist the new pair atomically.",
          client_authentication:
            app.client_type === "confidential"
              ? "client_secret_basic or client_secret_post, plus PKCE"
              : "client_id and PKCE; no secret",
          documentation: `${PORTAL_URL}/developers/docs`,
        })
      } catch (error) {
        return failure(error)
      }
    }
  )
}
