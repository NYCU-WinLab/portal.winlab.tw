export type UploadFailureStage =
  | "type"
  | "video-processing"
  | "storage-upload"
  | "storage-verify"
  | "db-insert"
  | "network"
  | "aborted"
  | "unknown"

export type UploadFailure = {
  file: File
  detail: string
  /** Short user-facing explanation (toast / list). */
  userMessage: string
  stage: UploadFailureStage
  sequenceId: string | null
  sequenceIndex: number | null
}

export class UploadFailureError extends Error {
  constructor(
    readonly stage: UploadFailureStage,
    message: string,
    readonly userMessage?: string
  ) {
    super(message)
    this.name = "UploadFailureError"
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true
  if (!(error instanceof Error)) return false
  return (
    error.name === "AbortError" ||
    /aborted|cancelled|canceled/i.test(error.message)
  )
}

function isNetworkish(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("the internet connection appears to be offline") ||
    lower.includes("err_network") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("econnreset") ||
    lower.includes("socket")
  )
}

/** Map raw errors / server strings into stage + readable copy. */
export function describeUploadFailure(error: unknown): {
  detail: string
  stage: UploadFailureStage
  userMessage: string
} {
  if (error instanceof UploadFailureError) {
    return {
      detail: error.message,
      stage: error.stage,
      userMessage:
        error.userMessage ?? userMessageForStage(error.stage, error.message),
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()

  if (isAbortError(error)) {
    return {
      detail: message,
      stage: "aborted",
      userMessage: "Upload cancelled.",
    }
  }

  if (
    lower.includes("unsupported") ||
    lower.includes("invalid media type") ||
    lower.includes("extension")
  ) {
    return {
      detail: message,
      stage: "type",
      userMessage: userMessageForStage("type", message),
    }
  }

  if (lower.includes("verify upload") || lower.includes("file not found")) {
    return {
      detail: message,
      stage: "storage-verify",
      userMessage: userMessageForStage("storage-verify", message),
    }
  }

  if (lower.includes("database insert failed")) {
    return {
      detail: message,
      stage: "db-insert",
      userMessage: userMessageForStage("db-insert", message),
    }
  }

  if (
    lower.includes("compress") ||
    lower.includes("poster") ||
    lower.includes("encoder") ||
    lower.includes("ffmpeg") ||
    lower.includes("cdn blocked") ||
    lower.includes("unpkg") ||
    lower.includes("video too") ||
    lower.includes("browser cannot decode") ||
    lower.includes("memory access")
  ) {
    return {
      detail: message,
      stage: "video-processing",
      userMessage: userMessageForStage("video-processing", message),
    }
  }

  if (isNetworkish(message)) {
    return {
      detail: message,
      stage: "network",
      userMessage: userMessageForStage("network", message),
    }
  }

  if (
    lower.includes("payload too large") ||
    lower.includes("entity too large") ||
    lower.includes("maximum allowed size") ||
    lower.includes("file size") ||
    lower.includes("too large")
  ) {
    return {
      detail: message,
      stage: "storage-upload",
      userMessage:
        "File exceeds the 30 MB gallery limit after compression. Try a shorter clip or a smaller photo.",
    }
  }

  if (lower.includes("upload") || lower.includes("storage")) {
    return {
      detail: message,
      stage: "storage-upload",
      userMessage: userMessageForStage("storage-upload", message),
    }
  }

  return {
    detail: message,
    stage: "unknown",
    userMessage: userMessageForStage("unknown", message),
  }
}

export function userMessageForStage(
  stage: UploadFailureStage,
  detail: string
): string {
  switch (stage) {
    case "type":
      return `Unsupported file type. Use JPEG/PNG/WebP/GIF/HEIC or MP4/MOV/WebM. (${shortDetail(detail)})`
    case "video-processing":
      if (/cdn|unpkg|encoder|ffmpeg|ad blocker/i.test(detail)) {
        return "Video compress is unavailable here (encoder CDN blocked). Upload may continue without compress, or sync ffmpeg locally."
      }
      return `Could not process this video on your phone. Try a shorter clip (≤60s) or export as 720p MP4. (${shortDetail(detail)})`
    case "storage-upload":
      return `Upload to storage failed — check Wi‑Fi/cellular and retry. (${shortDetail(detail)})`
    case "storage-verify":
      return `Upload may still be syncing on a slow network. Wait a moment and tap Retry failed. (${shortDetail(detail)})`
    case "db-insert":
      return `Saved the file but could not register it. Retry — duplicates are safe. (${shortDetail(detail)})`
    case "network":
      return `Network dropped mid-upload. Stay on Wi‑Fi if you can, then Retry failed.`
    case "aborted":
      return "Upload cancelled."
    case "unknown":
    default:
      return `Upload failed. (${shortDetail(detail)})`
  }
}

function shortDetail(detail: string): string {
  const oneLine = detail.replace(/\s+/g, " ").trim()
  if (oneLine.length <= 80) return oneLine
  return `${oneLine.slice(0, 77)}…`
}

export function formatFailurePreview(failure: UploadFailure): string {
  return `${failure.file.name} [${failure.stage}] ${failure.userMessage}`
}

/** Classify a registerGalleryImage error string into a stage. */
export function stageFromRegisterError(error: string): UploadFailureStage {
  const lower = error.toLowerCase()
  if (lower.includes("database insert failed")) return "db-insert"
  if (lower.includes("verify upload") || lower.includes("file not found")) {
    return "storage-verify"
  }
  if (lower.includes("not signed")) return "unknown"
  if (lower.includes("invalid") || lower.includes("required")) return "type"
  if (isNetworkish(error)) return "network"
  return "unknown"
}
