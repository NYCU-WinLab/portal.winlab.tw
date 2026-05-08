import { NextRequest, NextResponse } from "next/server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL!
const NEXTCLOUD_USERNAME = process.env.NEXTCLOUD_USERNAME!
const NEXTCLOUD_APP_PASSWORD = process.env.NEXTCLOUD_APP_PASSWORD!

const PPT_EXT = /\.(ppt|pptx|pdf|key)$/i
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm)$/i
const PROPFIND_BODY = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:displayname/><oc:fileid/></d:prop></d:propfind>`

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
}

async function propfindByDate(
  authHeader: string,
  path: string,
  extRegex: RegExp
): Promise<Map<string, string>> {
  const davBase = `${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USERNAME}`
  const map = new Map<string, string>()

  let res: Response
  try {
    res = await fetch(`${davBase}/${path}`, {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader,
        Depth: "1",
        "Content-Type": "application/xml",
      },
      body: PROPFIND_BODY,
    })
  } catch {
    return map
  }

  if (!res.ok) return map

  const xml = await res.text()
  const blocks = xml.match(/<d:response>[\s\S]*?<\/d:response>/g) ?? []

  for (const block of blocks) {
    const hrefMatch = block.match(/<d:href>([^<]+)<\/d:href>/)
    const fileidMatch = block.match(/<oc:fileid>(\d+)<\/oc:fileid>/)
    if (!hrefMatch?.[1]) continue

    const parts = hrefMatch[1].split("/").filter(Boolean)
    const filename = decodeURIComponent(parts[parts.length - 1] ?? "")

    if (!extRegex.test(filename)) continue

    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/)
    const dateKey = dateMatch?.[1]
    if (!dateKey) continue

    const fileUrl = fileidMatch
      ? `${NEXTCLOUD_URL}/f/${fileidMatch[1]}`
      : `${NEXTCLOUD_URL}/apps/files/?dir=/${path}`

    if (!map.has(dateKey)) map.set(dateKey, fileUrl)
  }

  return map
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("roles, is_admin")
    .eq("id", user.id)
    .single()

  const roles = profile?.roles as Record<string, string[]> | undefined
  const isAdmin =
    profile?.is_admin === true ||
    (Array.isArray(roles?.meetings) && roles.meetings.includes("admin"))

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const year = Number(body?.year)
  if (!year || isNaN(year)) {
    return NextResponse.json({ error: "Missing year" }, { status: 400 })
  }

  if (!NEXTCLOUD_URL || !NEXTCLOUD_USERNAME || !NEXTCLOUD_APP_PASSWORD) {
    return NextResponse.json(
      { error: "NextCloud 環境變數未設定" },
      { status: 503 }
    )
  }

  const credentials = Buffer.from(
    `${NEXTCLOUD_USERNAME}:${NEXTCLOUD_APP_PASSWORD}`
  ).toString("base64")
  const authHeader = `Basic ${credentials}`

  const [pptFiles, videoFiles] = await Promise.all([
    propfindByDate(authHeader, `winlab/Meetings/${year}`, PPT_EXT),
    propfindByDate(authHeader, `winlab/Meetings/${year}/Recordings`, VIDEO_EXT),
  ])

  const service = createServiceClient()
  const { data: meetings, error } = await service
    .from("meetings")
    .select("id, scheduled_date, ppt_link, video_link")
    .eq("year", year)
    .eq("is_holiday", false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let pptUpdated = 0
  let videoUpdated = 0

  await Promise.all(
    (meetings ?? []).map(async (m) => {
      const date: string = m.scheduled_date
      const patch: Record<string, unknown> = {}

      const pptUrl = pptFiles.get(date)
      if (pptUrl && !m.ppt_link) {
        patch.ppt_link = pptUrl
        patch.ppt_uploaded = true
        pptUpdated++
      }

      const videoUrl = videoFiles.get(date)
      if (videoUrl && !m.video_link) {
        patch.video_link = videoUrl
        patch.video_uploaded = true
        videoUpdated++
      }

      if (Object.keys(patch).length === 0) return
      await service.from("meetings").update(patch).eq("id", m.id)
    })
  )

  return NextResponse.json({ pptUpdated, videoUpdated })
}
