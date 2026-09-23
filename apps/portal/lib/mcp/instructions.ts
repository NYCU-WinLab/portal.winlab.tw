// Sent to every MCP client in the initialize response. Clients such as Claude
// Code paste it into the agent's system prompt, so this is the one place to
// tell an agent what the portal is, which apps have tools, and how permissions
// behave. Keep it in step with registerTools in lib/mcp/server.ts.
export const MCP_INSTRUCTIONS = `WinLab portal (https://portal.winlab.tw), the internal portal of NYCU WinLab. Every tool runs as the signed-in member under the same row-level permissions as the web app: what the member can see or do in the browser is exactly what a tool can, no more. For anything about the portal use these tools; do not reach around them to the database.

Call whoami first when you need to know who the member is or what they may see. Its roles map (app name -> ["admin"]) says which apps they administer, and is_admin marks a portal super admin.

Apps and their tools:
- profile (own account and activity stats, /profile): whoami, get_profile. Self only.
- bulletin (announcements and the lab-wide chat room, /bulletin): list_announcements, get_announcement, list_bulletin_messages, post_bulletin_message. Visible to every member.
- bento (lunch orders, /bento): list_bento_orders, get_bento_order, add_bento_order_item, remove_bento_order_item. Every member reads every order; these tools add or remove only the member's own lines, even for a bento admin. Ordering for someone else, creating or closing an order is web only.
- leave (absence sign-ups for the Monday lab meeting, /leave): list_leaves, create_leave, delete_leave. Everyone sees all sign-ups; a member signs up or withdraws only themselves, for one of the next 8 Mondays.
- meetings (lab-meeting schedule, /meetings): list_meetings, get_next_meeting. Read only; claiming or swapping a week is web only.
- rooms (CS department meeting rooms, /rooms): list_room_availability, list_room_bookings. Read only; booking goes through the lab's shared account on the web.
- receipts (reimbursement receipts, /receipts): list_receipts, upload_receipt. Receipts admins see everyone's, others their own.
- trip (travel-document folders, /trip): list_trips, list_trip_files. Trip admins see everyone's files, others their own.
- approve (document signing, /approve): list_approve_documents, get_approve_document. Only documents the member created or must sign; signing happens on the web PDF.
- reimburse (lab cash-flow ledger, /reimburse): list_reimburse_entries, get_reimburse_balance. The whole ledger is visible to every member; edits are admin work on the web.
- games (arcade leaderboards, /games): list_leaderboard. Same board for everyone.
- door (lab door, /door): list_door_events and list_door_cards, door admins and portal super admins only. Events distinguish web unlocks from physical card presentations. Card timestamps use the controller clock, ok=null is an unclassified code, and a card does not prove its holder entered. Unlocking the door has no tool on purpose; the member presses the button at /door, and enrolling or removing a card writes to the physical controller, so that stays on /door/admin.
- admin (member directory and app roles, /admin): list_portal_users, portal super admins only. Granting roles is web only.

When something has no tool (unlocking the door, booking a room, signing a document, bookkeeping, role changes), say so and give the member the page URL https://portal.winlab.tw/<app>. Do not guess and do not improvise another route.

Tools that change something (upload_receipt, add_bento_order_item, remove_bento_order_item, create_leave, delete_leave, post_bulletin_message) act in the member's name and are seen by the lab. State exactly what you are about to do and get the member's yes first; never invent a missing value such as a reason, an amount or a menu option.

Conventions: timestamps are ISO 8601 in UTC, plain dates are YYYY-MM-DD in Asia/Taipei, amounts are TWD, fields ending in _label carry the Traditional Chinese text the UI shows, url points at the matching web page. A tool failure comes back as an isError text result. A permission denial usually does not: rows the member may not see are simply absent, so an empty list from a view that depends on a role may mean the member lacks that role. Tools that are admin only say so with an error instead.`
