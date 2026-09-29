import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { headers } from "next/headers"
import { after } from "next/server"

import { drainOutboxBatch as drainApproveOutbox } from "@/lib/approve/email-drain"
import { doorConfigured } from "@/lib/door/client"
import { pressDoor } from "@/lib/door/open"
import { reloadPanelGreetings } from "@/lib/door/panel"
import { callerAsUser } from "@/lib/mcp/context"
import { MCP_INSTRUCTIONS } from "@/lib/mcp/instructions"
import { MCP_SERVER_INFO, registerTools } from "@/lib/mcp/server"
import { createUserClient, verifySupabaseToken } from "@/lib/mcp/supabase"
import { cancelBookingFor, confirmBookingFor } from "@/lib/rooms/confirm"
import { removeStaleDoorSounds } from "@/lib/profile/door-sound"
import { drainOutboxBatch } from "@/lib/receipts/email-drain"
import { createAdminClient } from "@/lib/supabase/admin"

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
        // The /door button's own press, marked as an agent's: same relay
        // pulse, same audit row and panel greeting after the response.
        openDoor: async (caller) => {
          if (!doorConfigured()) throw new Error("Door API is not configured")
          return pressDoor(callerAsUser(caller), await headers(), "mcp")
        },
        // The /rooms actions' booking and cancelling, run as the caller: RLS
        // on their own client for the booking row, the shared dept account,
        // the Teams pipeline and the invite mail as on the web.
        bookRoom: (caller, input) =>
          confirmBookingFor(
            createUserClient(caller.token),
            callerAsUser(caller),
            input
          ),
        cancelRoomBooking: (caller, bookingId) =>
          cancelBookingFor(
            createUserClient(caller.token),
            callerAsUser(caller),
            bookingId
          ),
        // submitSignature's after(): a signature that completes a document
        // queues mail to its creator, and this sends it without waiting for
        // the daily sweep.
        afterApproveSignature: () => {
          after(async () => {
            try {
              await drainApproveOutbox()
            } catch (err) {
              console.error("[mcp] approve email drain failed", err)
            }
          })
        },
        // What saveDoorSound runs after its response. The tool stays on the
        // member's client; removing the replaced file needs the service role
        // (the bucket has no member SELECT policy) and, as on /profile, only
        // ever touches the caller's own folder.
        afterDoorSoundSave: (caller, files) => {
          after(async () => {
            try {
              await removeStaleDoorSounds(
                createAdminClient(),
                caller.userId,
                files
              )
            } catch (err) {
              console.error("[mcp] door sound cleanup failed", err)
            }
            await reloadPanelGreetings()
          })
        },
      }),
    {
      serverInfo: MCP_SERVER_INFO,
      instructions: MCP_INSTRUCTIONS,
    }
  ),
  (_req, bearer) => verifySupabaseToken(bearer),
  { required: true }
)

export { handler as GET, handler as POST, handler as DELETE }
