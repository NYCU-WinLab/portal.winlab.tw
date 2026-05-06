import { NextRequest, NextResponse } from "next/server"

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

  if (!year || !date) {
    return NextResponse.json({ error: "Missing year or date" }, { status: 400 })
  }

  const credentials = Buffer.from(
    `${NEXTCLOUD_USERNAME}:${NEXTCLOUD_APP_PASSWORD}`
  ).toString("base64")
  const authHeader = `Basic ${credentials}`
  const davBase = `${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USERNAME}`
  const recordingsPath = `winlab/Meeting/${year}/Recordings`

  try {
    const res = await fetch(`${davBase}/${recordingsPath}`, {
      method: "PROPFIND",
      headers: {
        Authorization: authHeader,
        Depth: "1",
      },
    })

    if (!res.ok) {
      return NextResponse.json({ videoLink: null })
    }

    const xml = await res.text()
    const dateVariants = [date, date.replace(/-/g, "")]

    // Parse each <d:response> block
    const blocks = xml.match(/<d:response>[\s\S]*?<\/d:response>/g) ?? []

    for (const block of blocks) {
      const hrefMatch = block.match(/<d:href>([^<]+)<\/d:href>/)
      const fileidMatch = block.match(/<oc:fileid>(\d+)<\/oc:fileid>/)

      if (!hrefMatch?.[1]) continue

      const parts = hrefMatch[1].split("/").filter(Boolean)
      const filename = decodeURIComponent(parts[parts.length - 1] ?? "")

      if (!VIDEO_EXTENSIONS.test(filename)) continue
      if (!dateVariants.some((v) => filename.includes(v))) continue

      const videoLink = fileidMatch
        ? `${NEXTCLOUD_URL}/f/${fileidMatch[1]}`
        : `${NEXTCLOUD_URL}/apps/files/?dir=/${recordingsPath}`

      return NextResponse.json({ videoLink, filename })
    }

    return NextResponse.json({ videoLink: null })
  } catch {
    return NextResponse.json({ videoLink: null })
  }
}
