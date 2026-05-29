import { describe, expect, test } from "bun:test"

import { isValidClientObjectPath } from "@/lib/gallery/object-path"

const UID = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const FILE_UUID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"

describe("isValidClientObjectPath", () => {
  test("accepts a real <ownUid>/<uuid>.<ext> under the caller's id", () => {
    expect(isValidClientObjectPath(`${UID}/${FILE_UUID}.jpg`, UID)).toBe(true)
    expect(isValidClientObjectPath(`${UID}/${FILE_UUID}.png`, UID)).toBe(true)
    expect(isValidClientObjectPath(`${UID}/${FILE_UUID}.mp4`, UID)).toBe(true)
  })

  test("rejects a path under another user's prefix", () => {
    expect(isValidClientObjectPath(`${OTHER}/${FILE_UUID}.jpg`, UID)).toBe(
      false
    )
  })

  test("rejects a bare path with no leading <uid>/ prefix", () => {
    expect(isValidClientObjectPath(`${FILE_UUID}.jpg`, UID)).toBe(false)
  })

  test("rejects '..' traversal inside the filename segment", () => {
    expect(isValidClientObjectPath(`${UID}/..`, UID)).toBe(false)
    expect(isValidClientObjectPath(`${UID}/..${FILE_UUID}.jpg`, UID)).toBe(
      false
    )
  })

  test("rejects a nested '/' path (more than one segment after the prefix)", () => {
    expect(isValidClientObjectPath(`${UID}/sub/${FILE_UUID}.jpg`, UID)).toBe(
      false
    )
  })

  test("rejects an empty segment after the prefix", () => {
    expect(isValidClientObjectPath(`${UID}/`, UID)).toBe(false)
  })

  test("rejects a filename that is not a uuid shape", () => {
    expect(isValidClientObjectPath(`${UID}/not-a-uuid.jpg`, UID)).toBe(false)
    expect(isValidClientObjectPath(`${UID}/${FILE_UUID}xx.jpg`, UID)).toBe(
      false
    )
  })

  test("rejects a uuid with no extension", () => {
    expect(isValidClientObjectPath(`${UID}/${FILE_UUID}`, UID)).toBe(false)
  })

  test("rejects a uuid with a disallowed extension", () => {
    expect(isValidClientObjectPath(`${UID}/${FILE_UUID}.exe`, UID)).toBe(false)
    expect(isValidClientObjectPath(`${UID}/${FILE_UUID}.mp3`, UID)).toBe(false)
  })

  test("imageOnly accepts an image extension", () => {
    expect(
      isValidClientObjectPath(`${UID}/${FILE_UUID}.png`, UID, {
        imageOnly: true,
      })
    ).toBe(true)
  })

  test("imageOnly rejects a video extension that is otherwise allowed", () => {
    expect(isValidClientObjectPath(`${UID}/${FILE_UUID}.mp4`, UID)).toBe(true)
    expect(
      isValidClientObjectPath(`${UID}/${FILE_UUID}.mp4`, UID, {
        imageOnly: true,
      })
    ).toBe(false)
  })
})
