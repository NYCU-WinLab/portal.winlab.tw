import { describe, expect, test } from "bun:test"
import type { SupabaseClient } from "@supabase/supabase-js"

import {
  addDefaultSound,
  DEFAULT_SOUND_FAILED,
  DEFAULT_SOUND_NOT_FOUND,
  DEFAULT_SOUND_UPLOAD_MISSING,
  DEFAULT_SOUND_UPLOAD_REJECTED,
  deleteDefaultSound,
  updateDefaultSound,
} from "./default-sound-admin"
import { LABEL_EMPTY } from "./default-sounds"

const PATH = "defaults/20260929000000-aaaaaaaa.mp3"

type Result = { data: unknown; error: { code?: string } | null }

// Just enough of a PostgREST builder: every chained call returns the builder,
// and awaiting it (or maybeSingle()) resolves to the queued result for that
// operation.
function fakeDb(results: Partial<Record<string, Result>>) {
  const log: { op: string; args: unknown[] }[] = []
  const client = {
    from: () => {
      let op = "select"
      const builder: Record<string, unknown> = {}
      for (const name of ["select", "eq", "order"]) {
        builder[name] = (...args: unknown[]) => {
          log.push({ op: `${op}.${name}`, args })
          return builder
        }
      }
      for (const name of ["insert", "update", "delete"]) {
        builder[name] = (...args: unknown[]) => {
          op = name
          log.push({ op: name, args })
          return builder
        }
      }
      const result = () =>
        Promise.resolve(results[op] ?? { data: null, error: null })
      builder.maybeSingle = result
      builder.then = (
        resolve: (value: Result) => unknown,
        reject: (err: unknown) => unknown
      ) => result().then(resolve, reject)
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, log }
}

function fakeStorage(info: { size: number; contentType: string } | null) {
  const removed: string[][] = []
  const client = {
    storage: {
      from: () => ({
        info: async () =>
          info ? { data: info, error: null } : { data: null, error: {} },
        remove: async (paths: string[]) => {
          removed.push(paths)
          return { data: [], error: null }
        },
      }),
    },
  }
  return { client: client as unknown as SupabaseClient, removed }
}

const noSleep = async () => {}
const AUDIO = { size: 1000, contentType: "audio/mpeg" }

describe("addDefaultSound", () => {
  test("adds a checked upload with a normalised label", async () => {
    const db = fakeDb({ insert: { data: [{ id: "d1" }], error: null } })
    const storage = fakeStorage(AUDIO)
    const result = await addDefaultSound(
      { supabase: db.client, admin: storage.client, sleep: noSleep },
      { path: PATH, label: "  Hot  Limit " }
    )
    expect(result).toEqual({ ok: true, message: "已加入「Hot Limit」。" })
    expect(db.log.find((call) => call.op === "insert")?.args[0]).toEqual({
      label: "Hot Limit",
      path: PATH,
    })
    expect(storage.removed).toEqual([])
  })

  test("never removes a file an existing row already points at", async () => {
    const db = fakeDb({ select: { data: { id: "live" }, error: null } })
    const storage = fakeStorage(AUDIO)
    const result = await addDefaultSound(
      { supabase: db.client, admin: storage.client, sleep: noSleep },
      { path: PATH, label: "" }
    )
    expect(result).toEqual({ ok: false, error: DEFAULT_SOUND_UPLOAD_REJECTED })
    expect(storage.removed).toEqual([])
    expect(db.log.some((call) => call.op === "insert")).toBe(false)
  })

  test("rejects a path outside defaults/ without touching storage", async () => {
    const db = fakeDb({})
    const storage = fakeStorage(AUDIO)
    const result = await addDefaultSound(
      { supabase: db.client, admin: storage.client, sleep: noSleep },
      { path: "9155594a-9c4a-47e7-aac1-615551ec869a/x.mp3", label: "x" }
    )
    expect(result).toEqual({ ok: false, error: DEFAULT_SOUND_UPLOAD_REJECTED })
    expect(storage.removed).toEqual([])
    expect(db.log).toEqual([])
  })

  test("removes the upload when the label is empty", async () => {
    const storage = fakeStorage(AUDIO)
    const result = await addDefaultSound(
      { supabase: fakeDb({}).client, admin: storage.client, sleep: noSleep },
      { path: PATH, label: "  " }
    )
    expect(result).toEqual({ ok: false, error: LABEL_EMPTY })
    expect(storage.removed).toEqual([[PATH]])
  })

  test("removes an upload that is missing, too big or not audio", async () => {
    for (const [info, error] of [
      [null, DEFAULT_SOUND_UPLOAD_MISSING],
      [
        { size: 4 * 1024 * 1024, contentType: "audio/mpeg" },
        DEFAULT_SOUND_UPLOAD_REJECTED,
      ],
      [{ size: 10, contentType: "image/png" }, DEFAULT_SOUND_UPLOAD_REJECTED],
    ] as const) {
      const storage = fakeStorage(info)
      const result = await addDefaultSound(
        { supabase: fakeDb({}).client, admin: storage.client, sleep: noSleep },
        { path: PATH, label: "x" }
      )
      expect(result).toEqual({ ok: false, error })
      expect(storage.removed).toEqual([[PATH]])
    }
  })

  test("a failed insert removes the upload, a duplicate path does not", async () => {
    const failed = fakeStorage(AUDIO)
    expect(
      await addDefaultSound(
        {
          supabase: fakeDb({ insert: { data: null, error: { code: "42501" } } })
            .client,
          admin: failed.client,
          sleep: noSleep,
        },
        { path: PATH, label: "x" }
      )
    ).toEqual({ ok: false, error: DEFAULT_SOUND_FAILED })
    expect(failed.removed).toEqual([[PATH]])

    const duplicate = fakeStorage(AUDIO)
    await addDefaultSound(
      {
        supabase: fakeDb({ insert: { data: null, error: { code: "23505" } } })
          .client,
        admin: duplicate.client,
        sleep: noSleep,
      },
      { path: PATH, label: "x" }
    )
    expect(duplicate.removed).toEqual([])
  })
})

describe("updateDefaultSound", () => {
  test("toggles the rotation and says which way", async () => {
    const db = fakeDb({ update: { data: [{ id: "d1" }], error: null } })
    expect(
      await updateDefaultSound(db.client, "d1", { enabled: false })
    ).toEqual({
      ok: true,
      message: "已移出輪播。",
    })
    expect(db.log.find((call) => call.op === "update")?.args[0]).toEqual({
      enabled: false,
    })
  })

  test("a row RLS hid or that is gone is not found", async () => {
    const db = fakeDb({ update: { data: [], error: null } })
    expect(await updateDefaultSound(db.client, "d1", { label: "x" })).toEqual({
      ok: false,
      error: DEFAULT_SOUND_NOT_FOUND,
    })
  })

  test("rejects an empty patch or a non-boolean toggle before writing", async () => {
    const db = fakeDb({})
    expect((await updateDefaultSound(db.client, "d1", {})).ok).toBe(false)
    expect(
      (await updateDefaultSound(db.client, "d1", { enabled: "yes" })).ok
    ).toBe(false)
    expect(db.log).toEqual([])
  })
})

describe("deleteDefaultSound", () => {
  test("deletes the row, then removes its file", async () => {
    const db = fakeDb({
      delete: { data: [{ path: PATH, label: "舊的" }], error: null },
    })
    const storage = fakeStorage(AUDIO)
    expect(
      await deleteDefaultSound(
        { supabase: db.client, admin: storage.client },
        "d1"
      )
    ).toEqual({ ok: true, message: "已刪除「舊的」。" })
    expect(storage.removed).toEqual([[PATH]])
  })

  test("removes nothing when no row was deleted", async () => {
    const storage = fakeStorage(AUDIO)
    expect(
      await deleteDefaultSound(
        {
          supabase: fakeDb({ delete: { data: [], error: null } }).client,
          admin: storage.client,
        },
        "d1"
      )
    ).toEqual({ ok: false, error: DEFAULT_SOUND_NOT_FOUND })
    expect(storage.removed).toEqual([])
  })
})
