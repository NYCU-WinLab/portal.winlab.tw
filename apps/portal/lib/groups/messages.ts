// Strings shared between the server flows (membership.ts) and the UI, which
// needs to tell a refusal made before anything was sent from a failure that
// may have reached Google. Kept free of imports so a client component can
// load it without pulling in the Directory API client.

export const INVALID_INPUT = "請求內容格式不正確"
export const UNAUTHORIZED = "Unauthorized"

/** Most addresses one add request may carry; the server refuses more as malformed. */
export const MAX_BATCH = 200
