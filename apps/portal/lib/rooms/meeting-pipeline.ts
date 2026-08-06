// Triggers the GitLab pipeline that creates the Teams channel meeting.
//
// Fire-and-forget by design: the trigger returns a pipeline id in about a
// second, the meeting itself lands tens of seconds to minutes later via
// /api/rooms/meeting-callback. Nothing here waits for it.

import type { SupabaseClient } from "@supabase/supabase-js"

import { deliverablesParam } from "./deliverables"
import {
  hashCallbackToken,
  newCallbackToken,
  newRequestId,
} from "./meeting-request"

const DEFAULT_TRIGGER_URL =
  "https://gitlab.winlab.tw/api/v4/projects/177/trigger/pipeline"

const TRIGGER_REF = "main"

export interface MeetingRequestInput {
  bookingId: string
  title: string
  /** ISO 8601 with an offset — the pipeline rejects bare instants. */
  start: string
  end: string
  /**
   * The Keycloak group's leaf name, when the attendees came from a group.
   *
   * Deliberately the leaf and not a path: GitLab nests three levels deep
   * (winlab/network-system-design-and-implementation/tasa-satsim) where
   * Keycloak is flat (/winlab-projects/tasa-satsim), so a path built here
   * would look plausible and 404. GitLab resolves the leaf on its side and
   * fails loudly if it matches zero or more than one group.
   */
  groupName?: string | null
  /** Free text: what the meeting is for. Becomes the issue's body. */
  agenda?: string | null
  /** GitLab `Deliverable::*` labels, already validated against the list. */
  deliverables?: readonly string[]
}

export interface MeetingCancelInput {
  bookingId: string
  /**
   * The meeting's cancel_id — the 04000000… GlobalObjectId, NOT the
   * AAMkAG… Outlook event id. The spec calls this out explicitly because
   * the two are easy to confuse and the wrong one fails as CANCEL_FAILED.
   */
  cancelId: string
  messageId: string
  /** The original meeting's start, with an offset. */
  start: string
  reason?: string
}

export interface MeetingTriggerOutcome {
  requestId: string
  pipelineId: string | null
  /** Set when the trigger itself failed; the row is already marked failed. */
  error?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

export function meetingPipelineConfigured(): boolean {
  return !!process.env.GITLAB_MEETING_TRIGGER_TOKEN
}

/**
 * Creates the pending request row, then asks GitLab to run the pipeline.
 *
 * The row is written first on purpose. The callback can arrive before the
 * trigger's own HTTP response does on a fast run, and a callback that finds
 * no row would have nowhere to put the result.
 */
export async function triggerMeetingPipeline(
  admin: Admin,
  input: MeetingRequestInput
): Promise<MeetingTriggerOutcome> {
  return run(admin, "create", input.bookingId, (form) => {
    form.set("variables[ACTION]", "create")
    form.set("variables[SUBJECT]", input.title)
    form.set("variables[START_TIME]", input.start)
    form.set("variables[END_TIME]", input.end)
    if (input.groupName) form.set("variables[GROUP_NAME]", input.groupName)
    if (input.agenda) form.set("variables[AGENDA]", input.agenda)
    const deliverables = deliverablesParam(input.deliverables ?? [])
    if (deliverables) form.set("variables[DELIVERABLES]", deliverables)
  })
}

/**
 * Asks the pipeline to cancel a meeting it created.
 *
 * Same endpoint and same trigger token as creation — only ACTION differs.
 * Without this a cancelled booking leaves a meeting sitting in the channel
 * that still starts, still records, and still invites people to something
 * that isn't happening.
 */
export async function triggerMeetingCancel(
  admin: Admin,
  input: MeetingCancelInput
): Promise<MeetingTriggerOutcome> {
  return run(admin, "cancel", input.bookingId, (form) => {
    form.set("variables[ACTION]", "cancel")
    form.set("variables[EVENT_ID]", input.cancelId)
    form.set("variables[MESSAGE_ID]", input.messageId)
    form.set("variables[START_TIME]", input.start)
    if (input.reason) {
      form.set("variables[CANCELLATION_MESSAGE]", input.reason)
    }
  })
}

async function run(
  admin: Admin,
  kind: "create" | "cancel",
  bookingId: string,
  fill: (form: FormData) => void
): Promise<MeetingTriggerOutcome> {
  const token = process.env.GITLAB_MEETING_TRIGGER_TOKEN
  if (!token) throw new Error("GITLAB_MEETING_TRIGGER_TOKEN 未設定")

  const url = process.env.GITLAB_MEETING_TRIGGER_URL ?? DEFAULT_TRIGGER_URL
  const requestId = newRequestId()
  const callbackToken = newCallbackToken()

  const { error: insertError } = await admin
    .from("rooms_meeting_requests")
    .insert({
      request_id: requestId,
      booking_id: bookingId,
      kind,
      callback_token_hash: hashCallbackToken(callbackToken),
    })
  if (insertError) {
    throw new Error(`建立會議請求紀錄失敗:${insertError.message}`)
  }

  const form = new FormData()
  form.set("token", token)
  form.set("ref", TRIGGER_REF)
  form.set("variables[REQUEST_ID]", requestId)
  form.set("variables[CALLBACK_TOKEN]", callbackToken)
  fill(form)

  try {
    const response = await fetch(url, { method: "POST", body: form })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      const message = `GitLab trigger 回應 ${response.status}${body ? `:${body.slice(0, 200)}` : ""}`
      await markTriggerFailed(admin, requestId, message)
      return { requestId, pipelineId: null, error: message }
    }

    const json = (await response.json().catch(() => null)) as {
      id?: number | string
    } | null
    const pipelineId = json?.id != null ? String(json.id) : null
    if (pipelineId) {
      await admin
        .from("rooms_meeting_requests")
        .update({ pipeline_id: pipelineId })
        .eq("request_id", requestId)
    }
    return { requestId, pipelineId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await markTriggerFailed(admin, requestId, message)
    return { requestId, pipelineId: null, error: message }
  }
}

/**
 * A trigger that never started can't produce a callback, so it's resolved
 * here rather than left for the stuck-request sweep to notice hours later.
 */
async function markTriggerFailed(
  admin: Admin,
  requestId: string,
  message: string
): Promise<void> {
  await admin
    .from("rooms_meeting_requests")
    .update({
      status: "failed",
      stage: "starting",
      error_code: "TRIGGER_FAILED",
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq("request_id", requestId)
}
