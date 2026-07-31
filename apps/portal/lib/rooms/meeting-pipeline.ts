// Triggers the GitLab pipeline that creates the Teams channel meeting.
//
// Fire-and-forget by design: the trigger returns a pipeline id in about a
// second, the meeting itself lands tens of seconds to minutes later via
// /api/rooms/meeting-callback. Nothing here waits for it.

import type { SupabaseClient } from "@supabase/supabase-js"

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
  const token = process.env.GITLAB_MEETING_TRIGGER_TOKEN
  if (!token) throw new Error("GITLAB_MEETING_TRIGGER_TOKEN 未設定")

  const url = process.env.GITLAB_MEETING_TRIGGER_URL ?? DEFAULT_TRIGGER_URL
  const requestId = newRequestId()
  const callbackToken = newCallbackToken()

  const { error: insertError } = await admin
    .from("rooms_meeting_requests")
    .insert({
      request_id: requestId,
      booking_id: input.bookingId,
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
  form.set("variables[SUBJECT]", input.title)
  form.set("variables[START_TIME]", input.start)
  form.set("variables[END_TIME]", input.end)

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
