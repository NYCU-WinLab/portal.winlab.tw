// Reads the pipeline's callback payload into something the route can act on.
//
// The one rule worth stating up front: success is decided by whether a
// join_url came back, NOT by the `status` field. The pipeline reports
// OPTIONS_FAILED when the meeting was created but auto-recording/language
// couldn't be applied — the meeting exists and its URL is valid, and the
// integration notes are explicit that retrying it would create a duplicate.
// Branching on the URL handles that case whichever way `status` is set.

export interface MeetingPipelineRef {
  id: string | null
  url: string | null
}

export type MeetingOutcome =
  | {
      kind: "success"
      joinUrl: string
      webLink: string | null
      eventId: string | null
      threadId: string | null
      /** False when the meeting exists but its options didn't apply. */
      optionsApplied: boolean
      stage: string | null
      pipeline: MeetingPipelineRef
    }
  | {
      kind: "failed"
      errorCode: string
      errorMessage: string
      stage: string | null
      pipeline: MeetingPipelineRef
    }

export type CallbackRead =
  | { ok: true; requestId: string; outcome: MeetingOutcome }
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

  const pipelineRaw = record(root.pipeline)
  const pipeline: MeetingPipelineRef = {
    id: pipelineRaw ? str(pipelineRaw.id) : null,
    url: pipelineRaw ? str(pipelineRaw.url) : null,
  }
  const stage = str(root.stage)
  const errorRaw = record(root.error)
  const errorCode = errorRaw ? str(errorRaw.code) : null

  const meeting = record(root.meeting)
  const joinUrl = meeting ? str(meeting.join_url) : null

  if (joinUrl) {
    return {
      ok: true,
      requestId,
      outcome: {
        kind: "success",
        joinUrl,
        webLink: str(meeting?.web_link),
        eventId: str(meeting?.event_id),
        threadId: str(meeting?.thread_id),
        // Trust an explicit false, and treat OPTIONS_FAILED as false even if
        // the flag is missing — those are the same condition reported twice.
        optionsApplied:
          root.options_applied === true && errorCode !== "OPTIONS_FAILED",
        stage,
        pipeline,
      },
    }
  }

  return {
    ok: true,
    requestId,
    outcome: {
      kind: "failed",
      // A payload with no URL and no error code is itself a broken response;
      // saying so beats recording an empty reason.
      errorCode: errorCode ?? "UNEXPECTED_RESPONSE",
      errorMessage:
        (errorRaw ? str(errorRaw.message) : null) ??
        "pipeline 沒有回傳會議連結,也沒有說明原因",
      stage,
      pipeline,
    },
  }
}

/** Stable codes from the pipeline, in words the person who booked can act on. */
const REASONS: Record<string, string> = {
  INVALID_REQUEST: "Portal 送出的欄位不完整(這是 Portal 的問題,請回報)",
  LOGIN_FAILED: "會議服務帳號登入失敗,密碼可能已過期",
  MFA_REQUIRED: "會議服務帳號要求 MFA,自動化無法通過,需要人工處理",
  INVALID_PAYLOAD: "Teams 拒絕了這個會議內容",
  CREATE_FAILED: "Teams 建立會議的 API 失敗",
  OPTIONS_FAILED: "會議已建立,但自動錄影/語言選項沒有套用",
  UNEXPECTED_RESPONSE: "Teams 的回應缺少必要欄位",
  UNKNOWN: "未預期的錯誤",
}

export function describeFailure(code: string, message: string): string {
  const reason = REASONS[code]
  return reason ? `${reason}(${code}:${message})` : `${code}:${message}`
}

/**
 * Whether it's worth trying the same request again.
 *
 * Deliberately conservative: only CREATE_FAILED is a transient API failure.
 * Everything else needs either a code change or a human, and quietly retrying
 * would just burn pipeline runs while looking like progress.
 */
export function isRetryable(code: string): boolean {
  return code === "CREATE_FAILED"
}
