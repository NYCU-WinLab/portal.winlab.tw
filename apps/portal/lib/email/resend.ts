import { Resend } from "resend"

// winlab.tw mail lives on notifications.winlab.tw in Resend (verified in
// ap-northeast-1). Keeping a single From identity so replies land consistently.
export const MAIL_FROM = "WinLab Approve <approve@notifications.winlab.tw>"

export function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error("RESEND_API_KEY missing")
  return new Resend(key)
}

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://portal.winlab.tw"
}
