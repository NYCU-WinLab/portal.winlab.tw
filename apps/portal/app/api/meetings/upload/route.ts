import { NextRequest, NextResponse } from "next/server"

const NEXTCLOUD_URL = process.env.NEXTCLOUD_URL!
const NEXTCLOUD_USERNAME = process.env.NEXTCLOUD_USERNAME!
const NEXTCLOUD_APP_PASSWORD = process.env.NEXTCLOUD_APP_PASSWORD!

export async function POST(request: NextRequest) {
  if (!NEXTCLOUD_URL || !NEXTCLOUD_USERNAME || !NEXTCLOUD_APP_PASSWORD) {
    return NextResponse.json(
      { error: "NextCloud 環境變數未設定，請聯絡管理員" },
      { status: 503 }
    )
  }

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

  const davBase = `${NEXTCLOUD_URL}/remote.php/dav/files/${NEXTCLOUD_USERNAME}`

  // winlab/meetings/{year} and optionally /Recordings — create each level
  const folders =
    type === "video"
      ? [
          `winlab/meetings`,
          `winlab/meetings/${year}`,
          `winlab/meetings/${year}/Recordings`,
        ]
      : [`winlab/meetings`, `winlab/meetings/${year}`]

  for (const folder of folders) {
    await fetch(`${davBase}/${folder}`, {
      method: "MKCOL",
      headers: { Authorization: authHeader },
    })
  }

  const subFolder =
    type === "video"
      ? `winlab/meetings/${year}/Recordings`
      : `winlab/meetings/${year}`

  const folderUrl = `${davBase}/${subFolder}`
  const fileUrl = `${folderUrl}/${file.name}`
  const res = await fetch(fileUrl, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(buffer),
  })

  if (!res.ok) {
    return NextResponse.json(
      { error: `NextCloud upload failed: ${res.status} ${res.statusText}` },
      { status: 502 }
    )
  }

  const rawFileId = res.headers.get("OC-FileId")
  const viewUrl = rawFileId
    ? `${NEXTCLOUD_URL}/f/${parseInt(rawFileId, 10)}`
    : `${NEXTCLOUD_URL}/apps/files/?dir=/winlab/meetings/${year}`

  return NextResponse.json({ url: viewUrl })
}
