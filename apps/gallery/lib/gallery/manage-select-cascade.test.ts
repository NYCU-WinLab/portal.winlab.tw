import { describe, expect, test } from "bun:test"

import {
  FULL_MANAGE_CAPS,
  MANAGE_SELECT_MINIMAL,
  buildManageSelect,
  loadManageUploadsWithCascade,
  peelManageCapsFromError,
  type ManageColumnCaps,
} from "@/lib/gallery/manage-select-cascade"

describe("buildManageSelect", () => {
  test("starts from minimal columns", () => {
    expect(
      buildManageSelect({
        video: false,
        sequence: false,
        pin: false,
        takenAt: false,
      })
    ).toBe(MANAGE_SELECT_MINIMAL)
  })

  test("includes optional families in a stable order", () => {
    expect(buildManageSelect(FULL_MANAGE_CAPS)).toBe(
      `${MANAGE_SELECT_MINIMAL}, media_type, poster_path, duration_seconds, sequence_id, sequence_index, pinned_at, taken_at`
    )
  })

  test("omits peeled families", () => {
    expect(
      buildManageSelect({
        video: false,
        sequence: true,
        pin: true,
        takenAt: false,
      })
    ).toBe(`${MANAGE_SELECT_MINIMAL}, sequence_id, sequence_index, pinned_at`)
  })
})

describe("peelManageCapsFromError", () => {
  const full = FULL_MANAGE_CAPS

  test("peels video columns first when media_type is missing", () => {
    expect(
      peelManageCapsFromError(full, {
        code: "PGRST204",
        message: "Could not find the 'media_type' column in the schema cache",
      })
    ).toEqual({ ...full, video: false })
  })

  test("peels sequence when sequence_id is missing", () => {
    const caps: ManageColumnCaps = { ...full, video: false }
    expect(
      peelManageCapsFromError(caps, {
        code: "PGRST204",
        message: "Could not find the 'sequence_id' column in the schema cache",
      })
    ).toEqual({ ...caps, sequence: false })
  })

  test("peels taken_at before pin when both still enabled", () => {
    expect(
      peelManageCapsFromError(full, {
        code: "42703",
        message: 'column "taken_at" does not exist',
      })
    ).toEqual({ ...full, takenAt: false })
  })

  test("peels pin when pinned_at is missing", () => {
    expect(
      peelManageCapsFromError(full, {
        code: "PGRST204",
        message: "Could not find the 'pinned_at' column in the schema cache",
      })
    ).toEqual({ ...full, pin: false })
  })

  test("returns null for unrelated errors", () => {
    expect(
      peelManageCapsFromError(full, {
        code: "42501",
        message: "permission denied for table gallery_images",
      })
    ).toBeNull()
  })

  test("returns null when the matching family is already peeled", () => {
    expect(
      peelManageCapsFromError(
        { ...full, video: false },
        {
          code: "PGRST204",
          message: "Could not find the 'media_type' column in the schema cache",
        }
      )
    ).toBeNull()
  })
})

describe("loadManageUploadsWithCascade", () => {
  test("returns full caps when the first select succeeds", async () => {
    const rows = [{ id: "a" }]
    const result = await loadManageUploadsWithCascade(async () => ({
      data: rows,
      error: null,
    }))
    expect(result.rows?.length).toBe(1)
    expect(result.rows?.[0]?.id).toBe("a")
    expect(result.videoAvailable).toBe(true)
    expect(result.sequenceAvailable).toBe(true)
    expect(result.pinAvailable).toBe(true)
    expect(result.takenAtAvailable).toBe(true)
  })

  test("peels video then sequence until a select succeeds", async () => {
    const selects: string[] = []
    const result = await loadManageUploadsWithCascade(async (select) => {
      selects.push(select)
      if (select.includes("media_type")) {
        return {
          data: null,
          error: {
            code: "PGRST204",
            message:
              "Could not find the 'media_type' column in the schema cache",
          },
        }
      }
      if (select.includes("sequence_id")) {
        return {
          data: null,
          error: {
            code: "PGRST204",
            message:
              "Could not find the 'sequence_id' column in the schema cache",
          },
        }
      }
      return { data: [{ id: "ok" }], error: null }
    })

    expect(selects).toHaveLength(3)
    expect(result.rows?.map((row) => row.id)).toEqual(["ok"])
    expect(result.videoAvailable).toBe(false)
    expect(result.sequenceAvailable).toBe(false)
    expect(result.pinAvailable).toBe(true)
    expect(result.takenAtAvailable).toBe(true)
  })

  test("returns null rows when the error is not peelable", async () => {
    const result = await loadManageUploadsWithCascade(async () => ({
      data: null,
      error: { code: "42501", message: "permission denied" },
    }))
    expect(result.rows).toBeNull()
    expect(result.videoAvailable).toBe(true)
  })
})
