import type { McpServer } from "@modelcontextprotocol/server"

import { registerAdminTools } from "@/lib/mcp/tools/admin"
import { registerApproveTools } from "@/lib/mcp/tools/approve"
import { registerBentoTools } from "@/lib/mcp/tools/bento"
import { registerBulletinTools } from "@/lib/mcp/tools/bulletin"
import { registerDoorTools } from "@/lib/mcp/tools/door"
import { registerGamesTools } from "@/lib/mcp/tools/games"
import { registerIdentityTools } from "@/lib/mcp/tools/identity"
import { registerLeaveTools } from "@/lib/mcp/tools/leave"
import { registerMeetingsTools } from "@/lib/mcp/tools/meetings"
import { registerProfileTools } from "@/lib/mcp/tools/profile"
import {
  registerReceiptsTools,
  type ReceiptHooks,
} from "@/lib/mcp/tools/receipts"
import { registerReimburseTools } from "@/lib/mcp/tools/reimburse"
import { registerRoomsTools } from "@/lib/mcp/tools/rooms"
import { registerTripTools } from "@/lib/mcp/tools/trip"

export const MCP_SERVER_INFO = { name: "portal.winlab.tw", version: "0.2.0" }

// One module per portal app under lib/mcp/tools/. Adding a tool: register it
// in that app's module and name it in lib/mcp/instructions.ts.
export function registerTools(server: McpServer, hooks: ReceiptHooks = {}) {
  registerIdentityTools(server)
  registerProfileTools(server)
  registerBulletinTools(server)
  registerBentoTools(server)
  registerLeaveTools(server)
  registerMeetingsTools(server)
  registerRoomsTools(server)
  registerReceiptsTools(server, hooks)
  registerTripTools(server)
  registerApproveTools(server)
  registerReimburseTools(server)
  registerGamesTools(server)
  registerDoorTools(server)
  registerAdminTools(server)
}
