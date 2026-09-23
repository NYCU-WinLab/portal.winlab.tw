import { NextRequest, NextResponse } from "next/server"

import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/supabase/database.types"
import {
  applyFileUpdates,
  combineListings,
  planFileUpdates,
  PPT_EXT,
  propfindByDate,
  VIDEO_EXT,
  type SyncFilesResult,
} from "@/lib/meetings/sync-files"

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL!
const NEXTCLOUD_USERNAME = process.env.NEXTCLOUD_USERNAME!
const NEXTCLOUD_APP_PASSWORD = process.env.NEXTCLOUD_APP_PASSWORD!

function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
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

  const pptPath = `winlab/Meetings/${year}`
  const videoPath = `winlab/Meetings/${year}/Recordings`
  const listing = (path: string, extRegex: RegExp) =>
    propfindByDate({
      nextcloudUrl: NEXTCLOUD_URL,
      username: NEXTCLOUD_USERNAME,
      authHeader,
      path,
      extRegex,
    })
  const [ppt, video] = await Promise.all([
    listing(pptPath, PPT_EXT),
    listing(videoPath, VIDEO_EXT),
  ])

  const listings = combineListings(
    { label: "PPT", path: pptPath, result: ppt },
    { label: "錄影", path: videoPath, result: video }
  )
  if (!listings.ok) {
    return NextResponse.json(
      { error: listings.error, warnings: listings.warnings },
      { status: 502 }
    )
  }
  const { pptFiles, videoFiles, warnings } = listings

  const service = createServiceClient()
  const { data: meetings, error } = await service
    .from("meetings")
    .select("id, scheduled_date, ppt_link, video_link")
    // The folder is Meetings/<year>, and files land there by date, so the
    // rows to scan are "rows whose date falls in this year". This used to be
    // .eq("year", year) — that column didn't update when a row got shifted
    // across the year boundary, so the scan and the folder pointed at two
    // different years and that meeting's recording never linked on either
    // side.
    .gte("scheduled_date", `${year}-01-01`)
    .lte("scheduled_date", `${year}-12-31`)
    .eq("is_holiday", false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const plans = planFileUpdates(meetings ?? [], pptFiles, videoFiles)
  const applied = await applyFileUpdates(plans, (id, patch) =>
    service.from("meetings").update(patch).eq("id", id)
  )

  const result: SyncFilesResult = {
    ...applied,
    warnings: [...warnings, ...applied.warnings],
  }
  return NextResponse.json(result)
}
