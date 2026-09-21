// Sent to every MCP client in the initialize response. Clients such as Claude
// Code paste it into the agent's system prompt, so this is the one place to
// tell an agent what the portal is, which apps have tools, and how permissions
// behave. Keep it in step with registerTools in lib/mcp/server.ts.
export const MCP_INSTRUCTIONS = `WinLab portal (https://portal.winlab.tw), the internal portal of NYCU WinLab. Every tool runs as the signed-in member under the same row-level permissions as the web app: what the member can see or do in the browser is exactly what a tool can, no more.

Call whoami first when you need to know who the member is or what they may see. Its roles map (app name -> ["admin"]) says which apps they administer. For receipts and trip, an admin sees everyone's rows; everyone else sees only their own.

Apps on the portal and their MCP coverage:
- receipts (reimbursement receipts, /receipts): list_receipts, upload_receipt
- trip (travel-document folders, /trip): list_trips, list_trip_files
- bento (lunch orders), leave (Monday-meeting sign-ups), approve (document signing), meetings (lab-meeting schedule), reimburse (cash-flow ledger), rooms (CS dept meeting rooms), door (lab door unlock), bulletin (announcements), games, profile: no tools yet. When asked about one of these, say the portal MCP has no tool for it and point the member to https://portal.winlab.tw/<app>; do not guess and do not reach around the portal.

Conventions: ids are UUIDs, timestamps are ISO 8601 in UTC, fields ending in _label carry the Traditional Chinese text the UI shows. A tool failure comes back as an isError text result. A permission denial does not: rows the member may not see are simply absent, so an empty list from an admin-only view usually means the member is not an admin of that app.`
