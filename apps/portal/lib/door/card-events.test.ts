import { describe, expect, test } from "bun:test"

import {
  buildCardDoorEvent,
  cardIngestAuthorized,
  CardEventInputError,
  MAX_CARD_EVENT_BODY_BYTES,
  parseCardSwipes,
  readCardSwipes,
  type CardSwipe,
} from "@/lib/door/card-events"

const event: CardSwipe = {
  event_id: "a".repeat(64),
  card_id: "0000000042",
  device_time: "2026-09-22T12:30:15+08:00",
  event_code: "0000",
  reader: 1,
  received_at: "2026-09-22T04:43:30.123456+00:00",
}
const holder = {
  card_id: event.card_id,
  holder_name: "Guest",
  holder_user_id: null,
  updated_at: "2026-09-21T00:00:00Z",
}

describe("card ingest authentication", () => {
  const secret = "test-ingest-only-secret-32-characters"
  test("requires the dedicated bearer token", () => {
    expect(cardIngestAuthorized(`Bearer ${secret}`, secret)).toBe(true)
    expect(cardIngestAuthorized(`bearer ${secret}`, secret)).toBe(true)
    expect(cardIngestAuthorized(null, secret)).toBe(false)
    expect(cardIngestAuthorized("Bearer wrong", secret)).toBe(false)
    expect(cardIngestAuthorized("Bearer undefined", "")).toBe(false)
    expect(cardIngestAuthorized(`Basic ${secret}`, secret)).toBe(false)
  })
})

describe("card event validation", () => {
  test("keeps leading zeros and both clocks", () => {
    expect(parseCardSwipes({ events: [event] })).toEqual([event])
  })
  for (const invalid of [
    { card_id: "42" },
    { card_id: "0000000042\n" },
    { event_id: "a".repeat(64) + "\n" },
    { event_code: "00xx" },
    { reader: 3 },
    { device_time: "2026-02-30T12:30:15+08:00" },
    { device_time: "2026-09-22T12:30:15Z" },
    { received_at: "not a timestamp" },
  ]) {
    test(`rejects ${JSON.stringify(invalid)}`, () => {
      expect(() =>
        parseCardSwipes({ events: [{ ...event, ...invalid }] })
      ).toThrow(CardEventInputError)
    })
  }
  test("rejects empty, oversized and internally duplicated batches", () => {
    for (const events of [[], Array(101).fill(event), [event, event]]) {
      expect(() => parseCardSwipes({ events })).toThrow(CardEventInputError)
    }
  })
  test("bounds actual body bytes, even if content-length lies", async () => {
    const request = new Request("https://portal.example/api/door/events", {
      method: "POST",
      headers: { "Content-Length": "1" },
      body: " ".repeat(MAX_CARD_EVENT_BODY_BYTES + 1),
    })
    await expect(readCardSwipes(request)).rejects.toThrow("64 KiB")
  })
  test("accepts a valid body at the byte limit and rejects invalid JSON", async () => {
    const json = JSON.stringify({ events: [event] })
    const valid = new Request("https://portal.example/api/door/events", {
      method: "POST",
      body: json.padEnd(MAX_CARD_EVENT_BODY_BYTES),
    })
    expect(await readCardSwipes(valid)).toEqual([event])
    const invalid = new Request("https://portal.example/api/door/events", {
      method: "POST",
      body: "{",
    })
    await expect(readCardSwipes(invalid)).rejects.toThrow("Invalid event JSON")
  })
})

describe("physical-card audit snapshots", () => {
  test("stores a guest card without inventing an account or web attribution", () => {
    expect(buildCardDoorEvent(event, holder)).toMatchObject({
      source: "card",
      source_event_id: event.event_id,
      card_id: "0000000042",
      user_name: "Guest",
      user_id: null,
      user_email: null,
      ok: true,
      error: null,
      latency_ms: null,
      client_address: null,
      geo_city: null,
      created_at: event.device_time,
      received_at: event.received_at,
    })
  })
  test("distinguishes rejected and unclassified codes", () => {
    expect(buildCardDoorEvent({ ...event, event_code: "0014" })).toMatchObject({
      ok: false,
      error: "無此卡號",
    })
    expect(buildCardDoorEvent({ ...event, event_code: "00FE" })).toMatchObject({
      ok: null,
      error: null,
    })
  })
  test("does not attribute old history to a newer holder", () => {
    const row = buildCardDoorEvent(event, {
      ...holder,
      holder_user_id: "11111111-2222-3333-4444-555555555555",
      updated_at: "2026-09-22T05:00:00Z",
    })
    expect(row.user_id).toBeNull()
    expect(row.user_name).toBe("卡片")
  })
  test("never associates a different card", () => {
    expect(
      buildCardDoorEvent(event, { ...holder, card_id: "1234567890" }).user_name
    ).toBe("卡片")
  })
})
