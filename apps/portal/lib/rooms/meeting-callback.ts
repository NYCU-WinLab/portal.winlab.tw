// Reads the pipeline's callback payload into something the route can act on.
//
// Two rules decide success, and the order between them matters.
//
// 1. `action` first. A cancellation that worked reports no meeting and no
//    join_url — reading it with the create rule would call every successful
//    cancellation a failure and mail the creator about it.
// 2. For a creation, success is whether a join_url came back, NOT the
//    `status` field. The pipeline reports OPTIONS_FAILED when the meeting
//    was created but auto-recording/language couldn't be applied — the
//    meeting exists and its URL is valid, and the integration notes are
//    explicit that retrying it would create a duplicate.

export type MeetingAction = "create" | "cancel"

export interface MeetingPipelineRef {
  id: string | null
  url: string | null
}

export type MeetingOutcome =
  | {
      kind: "created"
      joinUrl: string
      webLink: string | null
      eventId: string | null
      threadId: string | null
      /** The 04000000… GlobalObjectId the cancel pipeline wants as EVENT_ID. */
      cancelId: string | null
      /** The channel post id the cancel pipeline wants as MESSAGE_ID. */
      messageId: string | null
      /** False when the meeting exists but its options didn't apply. */
      optionsApplied: boolean
      stage: string | null
      pipeline: MeetingPipelineRef
    }
  | {
      kind: "cancelled"
      stage: string | null
      pipeline: MeetingPipelineRef
    }
  | {
      kind: "failed"
      action: MeetingAction
      errorCode: string
      errorMessage: string
      stage: string | null
      pipeline: MeetingPipelineRef
    }

export type CallbackRead =
  | {
      ok: true
      requestId: string
      action: MeetingAction
      outcome: MeetingOutcome
    }
  | { ok: false; error: string }

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * @param headerRequestId the X-Request-Id header, when present. The body is
 *   authoritative; a mismatch is rejected rather than silently preferring one,
 *   since the two disagreeing means something built the request wrong.
 */
export function readCallback(
  body: unknown,
  headerRequestId?: string | null
): CallbackRead {
  const root = record(body)
  if (!root) return { ok: false, error: "body 不是 JSON 物件" }

  const requestId = str(root.request_id)
  if (!requestId) return { ok: false, error: "缺少 request_id" }

  const header = str(headerRequestId ?? null)
  if (header && header !== requestId) {
    return { ok: false, error: "X-Request-Id 與 body 的 request_id 不一致" }
  }

  // Absent means create — the trigger treats ACTION as optional too.
  const action: MeetingAction = root.action === "cancel" ? "cancel" : "create"

  const pipelineRaw = record(root.pipeline)
  const pipeline: MeetingPipelineRef = {
    id: pipelineRaw ? str(pipelineRaw.id) : null,
    url: pipelineRaw ? str(pipelineRaw.url) : null,
  }
  const stage = str(root.stage)
  const errorRaw = record(root.error)
  const errorCode = errorRaw ? str(errorRaw.code) : null
  const errorMessage = errorRaw ? str(errorRaw.message) : null

  const failed = (code: string, message: string): CallbackRead => ({
    ok: true,
    requestId,
    action,
    outcome: {
      kind: "failed",
      action,
      errorCode: code,
      errorMessage: message,
      stage,
      pipeline,
    },
  })

  if (action === "cancel") {
    // Nothing comes back but the status, so that's what decides it.
    if (root.status === "success" && !errorCode) {
      return {
        ok: true,
        requestId,
        action,
        outcome: { kind: "cancelled", stage, pipeline },
      }
    }
    return failed(
      errorCode ?? "UNKNOWN",
      errorMessage ?? "pipeline 沒有說明取消失敗的原因"
    )
  }

  const meeting = record(root.meeting)
  const joinUrl = meeting ? str(meeting.join_url) : null

  if (joinUrl) {
    return {
      ok: true,
      requestId,
      action,
      outcome: {
        kind: "created",
        joinUrl,
        webLink: str(meeting?.web_link),
        eventId: str(meeting?.event_id),
        threadId: str(meeting?.thread_id),
        cancelId: str(meeting?.cancel_id),
        messageId: str(meeting?.message_id),
        // Trust an explicit false, and treat OPTIONS_FAILED as false even if
        // the flag is missing — those are the same condition reported twice.
        optionsApplied:
          root.options_applied === true && errorCode !== "OPTIONS_FAILED",
        stage,
        pipeline,
      },
    }
  }

  // A payload with no URL and no error code is itself a broken response;
  // saying so beats recording an empty reason.
  return failed(
    errorCode ?? "UNEXPECTED_RESPONSE",
    errorMessage ?? "pipeline 沒有回傳會議連結,也沒有說明原因"
  )
}

/** Stable codes from the pipeline, in words the person who booked can act on. */
const REASONS: Record<string, string> = {
  INVALID_REQUEST: "Portal 送出的欄位不完整(這是 Portal 的問題,請回報)",
  LOGIN_FAILED: "會議服務帳號登入失敗,密碼可能已過期",
  MFA_REQUIRED: "會議服務帳號要求 MFA,自動化無法通過,需要人工處理",
  INVALID_PAYLOAD: "Teams 拒絕了這個會議內容",
  CREATE_FAILED: "Teams 建立會議的 API 失敗",
  OPTIONS_FAILED: "會議已建立,但自動錄影/語言選項沒有套用",
  CANCEL_FAILED: "Teams 取消會議的 API 失敗,可能識別碼錯誤或會議已經取消",
  UNEXPECTED_RESPONSE: "Teams 的回應缺少必要欄位",
  NO_CALLBACK: "pipeline 沒有在時限內回報結果",
  TRIGGER_FAILED: "Portal 連不上 GitLab,pipeline 沒有啟動",
  UNKNOWN: "未預期的錯誤",
}

export function describeFailure(code: string, message: string): string {
  const reason = REASONS[code]
  return reason ? `${reason}(${code}:${message})` : `${code}:${message}`
}

/**
 * Whether it's worth trying the same request again.
 *
 * Deliberately conservative: only the two transient API failures. Everything
 * else needs either a code change or a human, and quietly retrying would just
 * burn pipeline runs while looking like progress.
 */
export function isRetryable(code: string): boolean {
  return code === "CREATE_FAILED" || code === "CANCEL_FAILED"
}
