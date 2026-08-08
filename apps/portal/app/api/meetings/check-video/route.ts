import { NextRequest, NextResponse } from "next/server"

import {
  pickRecording,
  type RecordingFile,
} from "@/lib/meetings/recording-match"

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL!
const NEXTCLOUD_USERNAME = process.env.NEXTCLOUD_USERNAME!
const NEXTCLOUD_APP_PASSWORD = process.env.NEXTCLOUD_APP_PASSWORD!

const VIDEO_EXTENSIONS = /\.(mp4|mov|avi|mkv|webm)$/i

export async function GET(request: NextRequest) {
  if (!NEXTCLOUD_URL || !NEXTCLOUD_USERNAME || !NEXTCLOUD_APP_PASSWORD) {
    return NextResponse.json({ videoLink: null })
  }

  const { searchParams } = new URL(request.url)
  const year = searchParams.get("year")
  const date = searchParams.get("date")
  // The booking's project prefix, when the caller has one. Without it a
  // day with several meetings is ambiguous.
  const prefix = searchParams.get("prefix")

  if (!year || !date) {
    return NextResponse.json({ error: "Missing year or date" }, { status: 400 })
  }

  const credentials = Buffer.from(
    `${NEXTCLOUD_USERNAME}:${NEXTCLOUD_APP_PASSWORD}`
  ).toString("base64")
  const authHeader = `Basic ${credentials}`
  const davBase = `${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USERNAME}`
  const recordingsPath = `winlab/Meetings/${year}/Recordings`

  try {
    const res = await fetch(`${davBase}/${recordingsPath}`, {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader,
        Depth: "1",
        "Content-Type": "application/xml",
      },
      body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><d:displayname/><oc:fileid/></d:prop></d:propfind>`,
    })

    if (!res.ok) {
      return NextResponse.json({ videoLink: null })
    }

    const xml = await res.text()

    // Parse each <d:response> block
    const blocks = xml.match(/<d:response>[\s\S]*?<\/d:response>/g) ?? []
    const files: RecordingFile[] = []

    for (const block of blocks) {
      const hrefMatch = block.match(/<d:href>([^<]+)<\/d:href>/)
      const fileidMatch = block.match(/<oc:fileid>(\d+)<\/oc:fileid>/)

      if (!hrefMatch?.[1]) continue

      const parts = hrefMatch[1].split("/").filter(Boolean)
      const filename = decodeURIComponent(parts[parts.length - 1] ?? "")
      if (!VIDEO_EXTENSIONS.test(filename)) continue

      files.push({
        filename,
        href: hrefMatch[1],
        fileId: fileidMatch?.[1] ?? null,
      })
    }

    // Collect first, then choose — picking inside the loop is what made this
    // return whichever file the listing happened to yield first when several
    // meetings share a date.
    const hit = pickRecording(files, { date, prefix })
    if (!hit) return NextResponse.json({ videoLink: null })

    const videoLink = hit.fileId
      ? `${NEXTCLOUD_URL}/f/${hit.fileId}`
      : `${NEXTCLOUD_URL}/apps/files/?dir=/${recordingsPath}`

    return NextResponse.json({ videoLink, filename: hit.filename })
  } catch {
    return NextResponse.json({ videoLink: null })
  }
}
