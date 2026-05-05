import { NextRequest, NextResponse } from "next/server"

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL!
const NEXTCLOUD_USERNAME = process.env.NEXTCLOUD_USERNAME!
const NEXTCLOUD_APP_PASSWORD = process.env.NEXTCLOUD_APP_PASSWORD!

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const year = formData.get("year") as string | null
  const type = (formData.get("type") as string | null) ?? "ppt"

  if (!file || !year) {
    return NextResponse.json({ error: "Missing file or year" }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()
  const credentials = Buffer.from(
    `${NEXTCLOUD_USERNAME}:${NEXTCLOUD_APP_PASSWORD}`
  ).toString("base64")
  const authHeader = `Basic ${credentials}`

  const subFolder =
    type === "video" ? `winlab/Meeting/${year}/Recordings` : `winlab/Meeting/${year}`

  // Ensure target folder exists
  const folderUrl = `${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USERNAME}/${subFolder}`
  await fetch(folderUrl, {
    method: "MKCOL",
    headers: { Authorization: authHeader },
  })

  const fileUrl = `${folderUrl}/${file.name}`
  const res = await fetch(fileUrl, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/octet-stream",
    },
    body: buffer,
  })

  if (!res.ok) {
    return NextResponse.json(
      { error: `NextCloud upload failed: ${res.statusText}` },
      { status: res.status }
    )
  }

  const rawFileId = res.headers.get("OC-FileId")
  const viewUrl = rawFileId
    ? `${NEXTCLOUD_URL}/f/${parseInt(rawFileId, 10)}`
    : `${NEXTCLOUD_URL}/apps/files/?dir=/winlab/Meeting/${year}`

  return NextResponse.json({ url: viewUrl })
}
