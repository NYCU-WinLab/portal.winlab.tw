import { describe, expect, test } from "bun:test"

import { resolveTrip } from "@/lib/mcp/tools/trip"
import type { Trip } from "@/lib/trip/types"

function trip(id: string, name: string): Trip {
  return {
    id,
    name,
    description: null,
    status: "open",
    created_by: null,
    created_at: "2026-10-20T00:00:00Z",
    closed_at: null,
  }
}

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const C = "33333333-3333-4333-8333-333333333333"
const trips = [
  trip(A, "KubeSummit"),
  trip(B, "AI 課程助教出差"),
  trip(C, "KubeCon"),
]

describe("resolveTrip", () => {
  test("finds a trip by id", () => {
    expect(resolveTrip(trips, B).name).toBe("AI 課程助教出差")
  })

  test("refuses an unknown id", () => {
    expect(() =>
      resolveTrip(trips, "44444444-4444-4444-8444-444444444444")
    ).toThrow("no trip with id")
  })

  test("matches a full name regardless of case", () => {
    expect(resolveTrip(trips, "kubesummit").id).toBe(A)
  })

  test("takes a unique partial name", () => {
    expect(resolveTrip(trips, "助教").id).toBe(B)
  })

  test("refuses a partial name that matches several trips", () => {
    expect(() => resolveTrip(trips, "kube")).toThrow("matches 2 trips")
  })
})
