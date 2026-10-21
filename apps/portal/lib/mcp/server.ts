import type { McpServer } from "@modelcontextprotocol/server"

import { MCP_INSTRUCTIONS } from "@/lib/mcp/instructions"
import { registerDeveloperTools } from "@/lib/mcp/tools/developers"
import { registerAdminTools } from "@/lib/mcp/tools/admin"
import {
  registerApproveTools,
  type ApproveHooks,
} from "@/lib/mcp/tools/approve"
import { registerBentoTools } from "@/lib/mcp/tools/bento"
import { registerBulletinTools } from "@/lib/mcp/tools/bulletin"
import { registerDoorTools, type DoorHooks } from "@/lib/mcp/tools/door"
import { registerGamesTools } from "@/lib/mcp/tools/games"
import { registerIdentityTools } from "@/lib/mcp/tools/identity"
import { registerLeaveTools } from "@/lib/mcp/tools/leave"
import { registerMeetingsTools } from "@/lib/mcp/tools/meetings"
import {
  registerProfileTools,
  type ProfileHooks,
} from "@/lib/mcp/tools/profile"
import {
  registerReceiptsTools,
  type ReceiptHooks,
} from "@/lib/mcp/tools/receipts"
import { registerReimburseTools } from "@/lib/mcp/tools/reimburse"
import { registerRoomsTools, type RoomsHooks } from "@/lib/mcp/tools/rooms"
import { registerTripTools } from "@/lib/mcp/tools/trip"

export const MCP_SERVER_INFO = { name: "portal.winlab.tw", version: "0.11.0" }

// What route.ts hands createMcpHandler, shared so the tests boot the same
// server. maxToolInputElements is the fix for GHSA-46jr-4wx8-v453: the SDK
// walks every array element and object key in a call's arguments before a
// schema's .max() can refuse them, so one request under Vercel's body limit
// could exhaust the function's memory. The SDK leaves the cap off unless it
// is set. The largest real input, sign_approve_document's 50 values, is about
// 150 elements, so 1000 refuses nothing a tool would accept.
export const MCP_SERVER_OPTIONS = {
  serverInfo: MCP_SERVER_INFO,
  instructions: MCP_INSTRUCTIONS,
  maxToolInputElements: 1000,
}

// Follow-ups route.ts runs after a tool call, outside the tool itself.
export type ToolHooks = ReceiptHooks &
  ProfileHooks &
  ApproveHooks &
  DoorHooks &
  RoomsHooks

// One module per portal app under lib/mcp/tools/. Adding a tool: register it
// in that app's module and name it in lib/mcp/instructions.ts.
export function registerTools(server: McpServer, hooks: ToolHooks = {}) {
  registerIdentityTools(server)
  registerProfileTools(server, hooks)
  registerBulletinTools(server)
  registerBentoTools(server)
  registerLeaveTools(server)
  registerMeetingsTools(server)
  registerRoomsTools(server, hooks)
  registerReceiptsTools(server, hooks)
  registerTripTools(server)
  registerApproveTools(server, hooks)
  registerReimburseTools(server)
  registerGamesTools(server)
  registerDoorTools(server, hooks)
  registerAdminTools(server)
  registerDeveloperTools(server)
}
