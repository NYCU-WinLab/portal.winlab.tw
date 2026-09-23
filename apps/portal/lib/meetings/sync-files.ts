// Pure pieces of /api/meetings/sync-files: reading a Nextcloud PROPFIND,
// deciding which meeting rows to patch, and counting what actually got saved.
// Everything that talks to the network or the database is passed in, so the
// failure paths can be tested without either.

import type { TablesUpdate } from "@/lib/supabase/database.types"

export const PPT_EXT = /\.(ppt|pptx|pdf|key)$/i
export const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i

const PROPFIND_BODY = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:displayname/><oc:fileid/></d:prop></d:propfind>`

export type PropfindFailure = {
  ok: false
  // Absent when the request never got a response (DNS, TLS, refused).
  status?: number
  reason: string
}

/**
 * A folder listing either reached Nextcloud and came back 2xx, or it didn't.
 * The failure case used to be an empty map, which is exactly what a folder
 * with no new files looks like — so a dead Nextcloud read as "0 updated".
 */
export type PropfindResult =
  | { ok: true; files: Map<string, string> }
  | PropfindFailure

/** Maps `YYYY-MM-DD…` filenames in a PROPFIND reply to their share URL. */
export function parsePropfind(
  xml: string,
  opts: { nextcloudUrl: string; path: string; extRegex: RegExp }
): Map<string, string> {
  const map = new Map<string, string>()
  const blocks = xml.match(/<d:response>[\s\S]*?<\/d:response>/g) ?? []

  for (const block of blocks) {
    const hrefMatch = block.match(/<d:href>([^<]+)<\/d:href>/)
    const fileidMatch = block.match(/<oc:fileid>(\d+)<\/oc:fileid>/)
    if (!hrefMatch?.[1]) continue

    const parts = hrefMatch[1].split("/").filter(Boolean)
    const filename = decodeURIComponent(parts[parts.length - 1] ?? "")

    if (!opts.extRegex.test(filename)) continue

    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/)
    const dateKey = dateMatch?.[1]
    if (!dateKey) continue

    const fileUrl = fileidMatch
      ? `${opts.nextcloudUrl}/f/${fileidMatch[1]}`
      : `${opts.nextcloudUrl}/apps/files/?dir=/${opts.path}`

    if (!map.has(dateKey)) map.set(dateKey, fileUrl)
  }

  return map
}

export async function propfindByDate(opts: {
  nextcloudUrl: string
  username: string
  authHeader: string
  path: string
  extRegex: RegExp
  fetchFn?: typeof fetch
}): Promise<PropfindResult> {
  const fetchFn = opts.fetchFn ?? fetch
  const davBase = `${opts.nextcloudUrl}/remote.php/dav/files/${opts.username}`

  let res: Response
  try {
    res = await fetchFn(`${davBase}/${opts.path}`, {
      method: "PROPFIND",
      headers: {
        Authorization: opts.authHeader,
        Depth: "1",
        "Content-Type": "application/xml",
      },
      body: PROPFIND_BODY,
    })
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      reason: res.statusText || `HTTP ${res.status}`,
    }
  }

  let xml: string
  try {
    xml = await res.text()
  } catch (e) {
    return {
      ok: false,
      status: res.status,
      reason: e instanceof Error ? e.message : String(e),
    }
  }

  // A 2xx that isn't a multistatus (an SSO login or maintenance page, served
  // 200 after fetch followed a redirect) would parse to an empty map and read
  // as "nothing new". parsePropfind only understands the `d:` prefix, which is
  // what Nextcloud always sends, so that's what we require here too.
  if (!/<d:multistatus[\s>]/.test(xml)) {
    return {
      ok: false,
      status: res.status,
      reason: "unexpected response (not a WebDAV multistatus)",
    }
  }

  return {
    ok: true,
    files: parsePropfind(xml, {
      nextcloudUrl: opts.nextcloudUrl,
      path: opts.path,
      extRegex: opts.extRegex,
    }),
  }
}

/**
 * Nextcloud down, erroring server-side (5xx), or rejecting our app password is
 * not a partial result — no listing can be trusted, so the whole scan fails.
 * A single folder that errors any other way (say, a 404 because there's no
 * Recordings folder yet this year) still lets the other one link, and is
 * reported as a warning. A failure carrying a 2xx status means the reply
 * wasn't a readable WebDAV listing at all (say, a login page), so we aren't
 * talking to Nextcloud's DAV endpoint — fatal too.
 */
export function isFatalListingFailure(r: PropfindFailure): boolean {
  return (
    r.status === undefined ||
    r.status < 300 ||
    r.status === 401 ||
    r.status === 403 ||
    r.status >= 500
  )
}

export function describeListingFailure(
  label: string,
  path: string,
  r: PropfindFailure
): string {
  const status = r.status === undefined ? "無法連線" : `HTTP ${r.status}`
  return `${label} 資料夾 ${path} 讀取失敗（${status}：${r.reason}）`
}

type Listing = { label: string; path: string; result: PropfindResult }

/**
 * Turns the two folder listings into either the maps to link from, or the
 * error the route answers with (502). Fatal: Nextcloud unreachable or
 * unauthorized on either listing, or both listings failing — nothing was
 * scanned, so "0 linked" would be a lie. One folder failing some other way
 * is partial: the other folder still links and the failure is a warning.
 */
export function combineListings(
  ppt: Listing,
  video: Listing
):
  | {
      ok: true
      pptFiles: Map<string, string>
      videoFiles: Map<string, string>
      warnings: string[]
    }
  | { ok: false; error: string; warnings: string[] } {
  const warnings: string[] = []
  let fatal = !ppt.result.ok && !video.result.ok
  for (const l of [ppt, video]) {
    if (l.result.ok) continue
    warnings.push(describeListingFailure(l.label, l.path, l.result))
    if (isFatalListingFailure(l.result)) fatal = true
  }
  if (fatal) {
    return {
      ok: false,
      error: `無法讀取 NextCloud：${warnings.join("；")}`,
      warnings,
    }
  }
  return {
    ok: true,
    pptFiles: ppt.result.ok ? ppt.result.files : new Map(),
    videoFiles: video.result.ok ? video.result.files : new Map(),
    warnings,
  }
}

export type MeetingFileRow = {
  id: string
  scheduled_date: string
  ppt_link: string | null
  video_link: string | null
}

export type PlannedUpdate = {
  id: string
  date: string
  patch: TablesUpdate<"meetings">
  ppt: boolean
  video: boolean
}

/** Rows that have a matching file and no link yet. Existing links win. */
export function planFileUpdates(
  meetings: MeetingFileRow[],
  pptFiles: Map<string, string>,
  videoFiles: Map<string, string>
): PlannedUpdate[] {
  const plans: PlannedUpdate[] = []
  for (const m of meetings) {
    const patch: TablesUpdate<"meetings"> = {}
    const pptUrl = m.ppt_link ? undefined : pptFiles.get(m.scheduled_date)
    if (pptUrl) {
      patch.ppt_link = pptUrl
      patch.ppt_uploaded = true
    }
    const videoUrl = m.video_link ? undefined : videoFiles.get(m.scheduled_date)
    if (videoUrl) {
      patch.video_link = videoUrl
      patch.video_uploaded = true
    }
    if (pptUrl || videoUrl) {
      plans.push({
        id: m.id,
        date: m.scheduled_date,
        patch,
        ppt: Boolean(pptUrl),
        video: Boolean(videoUrl),
      })
    }
  }
  return plans
}

export type SyncFilesResult = {
  pptUpdated: number
  videoUpdated: number
  failed: number
  warnings: string[]
}

/**
 * Runs every planned update and counts a file only once its row is saved.
 * The counters used to go up before the write, off nothing more than a
 * non-empty patch, so a rejected update still reported as linked.
 * `failed` counts rows, and each failure adds one line to `warnings`.
 */
export async function applyFileUpdates(
  plans: PlannedUpdate[],
  update: (
    id: string,
    patch: TablesUpdate<"meetings">
  ) => PromiseLike<{ error: { message: string } | null }>
): Promise<SyncFilesResult> {
  const outcomes = await Promise.all(
    plans.map(async (plan) => {
      try {
        const { error } = await update(plan.id, plan.patch)
        return { plan, error: error ? error.message : null }
      } catch (e) {
        return { plan, error: e instanceof Error ? e.message : String(e) }
      }
    })
  )

  const result: SyncFilesResult = {
    pptUpdated: 0,
    videoUpdated: 0,
    failed: 0,
    warnings: [],
  }
  for (const { plan, error } of outcomes) {
    if (error !== null) {
      console.error(
        `[meetings/sync-files] update failed for meeting ${plan.id} (${plan.date}): ${error}`
      )
      result.failed++
      result.warnings.push(`${plan.date} 的會議更新失敗：${error}`)
      continue
    }
    if (plan.ppt) result.pptUpdated++
    if (plan.video) result.videoUpdated++
  }
  return result
}

/** How many warning lines a toast shows before collapsing the rest. */
export const MAX_TOAST_WARNINGS = 3

/** A handful of warnings, then a count — a toast is not a log. */
function formatWarnings(warnings: string[]): string {
  const shown = warnings.slice(0, MAX_TOAST_WARNINGS)
  const hidden = warnings.length - shown.length
  return hidden > 0 ? `${shown.join("；")}；…另 ${hidden} 筆` : shown.join("；")
}

/** The toast the admin sees after a scan. Success only when nothing went wrong. */
export function summarizeSyncResult(r: SyncFilesResult): {
  level: "success" | "warning" | "error"
  message: string
} {
  const linked = `PPT ${r.pptUpdated} 筆、錄影 ${r.videoUpdated} 筆已連結`
  if (r.failed > 0) {
    return {
      level: "error",
      message: `掃描完成但有 ${r.failed} 筆更新失敗：${linked}。${formatWarnings(r.warnings)}`,
    }
  }
  if (r.warnings.length > 0) {
    return {
      level: "warning",
      message: `掃描部分完成：${linked}。${formatWarnings(r.warnings)}`,
    }
  }
  return { level: "success", message: `掃描完成：${linked}` }
}
