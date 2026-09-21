import { describe, expect, test } from "bun:test"

import {
  big5ByteLength,
  diffControllerCards,
  hamsErrorMessage,
  isValidCardId,
  maskCardId,
  mergeDoorCards,
  planImport,
  planReconcile,
  uidToCardNumber,
  validateCardId,
  validateHolderName,
  type DoorCardRow,
} from "@/lib/door/cards"
import type { ControllerCard } from "@/lib/door/hams"

function row(card_id: string, extra: Partial<DoorCardRow> = {}): DoorCardRow {
  return {
    card_id,
    holder_name: "某人",
    holder_user_id: null,
    note: null,
    sync_state: "unknown",
    last_seen_at: null,
    ...extra,
  }
}

function card(card_id: string, name = "某人"): ControllerCard {
  return { card_id, name, time_index: 1, status: 14 }
}

describe("validateCardId", () => {
  test("accepts exactly ten digits, leading zeros included", () => {
    expect(validateCardId("0001234567")).toBeNull()
    expect(isValidCardId("0000000000")).toBe(true)
  })

  test("rejects the wrong length and says the zeros matter", () => {
    expect(validateCardId("1234567")).toContain("10")
    expect(validateCardId("12345678901")).not.toBeNull()
  })

  test("rejects non-digits and an empty field separately", () => {
    expect(validateCardId("12345678a0")).toBe("卡號只能是數字。")
    expect(validateCardId("")).toBe("請輸入卡號。")
  })
})

describe("big5ByteLength", () => {
  test("counts ASCII as one byte and CJK as two", () => {
    expect(big5ByteLength("loki")).toBe(4)
    expect(big5ByteLength("詹詠翔")).toBe(6)
    expect(big5ByteLength("詹詠翔 loki")).toBe(11)
  })

  test("counts an astral character once, not once per surrogate", () => {
    expect(big5ByteLength("🙂")).toBe(2)
  })
})

describe("validateHolderName", () => {
  test("accepts a name that fits in the controller's 16 bytes", () => {
    expect(validateHolderName("詹詠翔")).toBeNull()
    expect(validateHolderName("12345678")).toBeNull()
  })

  test("rejects a blank name and one that overflows", () => {
    expect(validateHolderName("   ")).toBe("請輸入姓名。")
    expect(validateHolderName("九個中文字剛好太長囉")).not.toBeNull()
  })

  test("measures the trimmed name, not the typed one", () => {
    expect(validateHolderName("  詹詠翔  ")).toBeNull()
  })
})

describe("hamsErrorMessage", () => {
  test("turns the bridge's worst two codes into instructions", () => {
    expect(hamsErrorMessage("table_suspect", "boom")).toBe(
      "卡機卡表疑似損毀，請先用 HAMS 重新上傳"
    )
    expect(hamsErrorMessage("verify_failed", "boom")).toBe(
      "卡機沒有確認這次變更，請按「與卡機比對」"
    )
  })

  test("explains a rename that deleted the card and never re-added it", () => {
    expect(hamsErrorMessage("rename_lost_card", "boom")).toContain("重新新增")
  })

  test("falls back to the raw message when there is no code", () => {
    expect(hamsErrorMessage(undefined, "boom")).toBe("boom")
  })
})

describe("maskCardId", () => {
  test("keeps only the last four digits", () => {
    expect(maskCardId("0001234567")).toBe("******4567")
  })

  test("leaves a too-short id alone rather than inventing padding", () => {
    expect(maskCardId("4567")).toBe("4567")
    expect(maskCardId("")).toBe("")
  })
})

describe("diffControllerCards", () => {
  test("splits the two lists three ways", () => {
    const diff = diffControllerCards(
      [row("0000000001"), row("0000000002")],
      [card("0000000001"), card("0000000003")]
    )
    expect(diff).toEqual({
      synced: ["0000000001"],
      missingOnController: ["0000000002"],
      unknownOnController: ["0000000003"],
    })
  })

  test("an empty controller means everything we have is missing", () => {
    const diff = diffControllerCards([row("0000000001")], [])
    expect(diff.missingOnController).toEqual(["0000000001"])
    expect(diff.synced).toEqual([])
  })
})

describe("mergeDoorCards", () => {
  test("marks a stored card synced and carries the controller's name", () => {
    const [view] = mergeDoorCards(
      [row("0000000001")],
      [card("0000000001", "Loki")]
    )
    expect(view?.sync_state).toBe("synced")
    expect(view?.controller_name).toBe("Loki")
    expect(view?.in_database).toBe(true)
  })

  test("shows a card the controller has and we do not", () => {
    const views = mergeDoorCards([], [card("0000000009", "訪客")])
    expect(views).toHaveLength(1)
    expect(views[0]?.sync_state).toBe("unknown_on_controller")
    expect(views[0]?.in_database).toBe(false)
    expect(views[0]?.holder_name).toBe("訪客")
  })

  test("keeps the stored sync_state when the bridge is unreachable", () => {
    const views = mergeDoorCards(
      [row("0000000001", { sync_state: "synced" })],
      null
    )
    expect(views[0]?.sync_state).toBe("synced")
    expect(views[0]?.controller_name).toBeNull()
  })

  test("sorts by card id so the table order is stable across refreshes", () => {
    const views = mergeDoorCards(
      [row("0000000003"), row("0000000001")],
      [card("0000000002"), card("0000000003")]
    )
    expect(views.map((v) => v.card_id)).toEqual([
      "0000000001",
      "0000000002",
      "0000000003",
    ])
  })
})

describe("planReconcile", () => {
  test("a clean comparison writes sync_state and reports no drift", () => {
    const plan = planReconcile(
      [row("0000000001"), row("0000000002")],
      [card("0000000001"), card("0000000002")],
      2
    )
    expect(plan.drifted).toBe(false)
    expect(plan.tableSuspect).toBe(false)
    expect(plan.writeSyncState).toBe(true)
    expect(plan.synced).toEqual(["0000000001", "0000000002"])
  })

  test("drift on either side is drift", () => {
    expect(
      planReconcile([row("0000000001")], [], 0).drifted
    ).toBe(true)
    expect(
      planReconcile([], [card("0000000009")], 1).drifted
    ).toBe(true)
  })

  test("an absurd card count blocks the sync_state write", () => {
    const plan = planReconcile(
      [row("0000000001")],
      [card("0000000001")],
      10240
    )
    expect(plan.tableSuspect).toBe(true)
    expect(plan.drifted).toBe(true)
    // The whole point: the cards read back fine, and we still refuse to
    // believe a table claiming ten thousand entries.
    expect(plan.writeSyncState).toBe(false)
    expect(plan.synced).toEqual(["0000000001"])
  })

  test("exactly at the alarm count is still trusted", () => {
    expect(planReconcile([], [], 200).tableSuspect).toBe(false)
    expect(planReconcile([], [], 201).tableSuspect).toBe(true)
  })
})

describe("planImport", () => {
  test("adopts what the controller has and we do not", () => {
    const plan = planImport(
      [card("0000000001"), card("0000000002")],
      ["0000000001"]
    )
    expect(plan.adopt.map((c) => c.card_id)).toEqual(["0000000002"])
    expect(plan.alreadyKnown).toBe(1)
    expect(plan.invalid).toEqual([])
  })

  test("sets aside a malformed id instead of failing the whole batch", () => {
    const plan = planImport([card("0000000001"), card("garbage")], [])
    expect(plan.adopt.map((c) => c.card_id)).toEqual(["0000000001"])
    expect(plan.invalid.map((c) => c.card_id)).toEqual(["garbage"])
  })

  test("a malformed id never counts as already known", () => {
    const plan = planImport([card("123")], ["123"])
    expect(plan.alreadyKnown).toBe(0)
    expect(plan.adopt).toEqual([])
    expect(plan.invalid).toHaveLength(1)
  })
})

describe("uidToCardNumber", () => {
  test("reverses a 4-byte UID into the controller's card number", () => {
    // The known card: reader UID 75 B3 8D 5E -> 5E8DB375 -> 1586344821.
    const result = uidToCardNumber(Uint8Array.from([0x75, 0xb3, 0x8d, 0x5e]))
    expect(result).toEqual({ ok: true, cardNumber: "1586344821" })
  })

  test("zero-pads a small number to ten digits", () => {
    const result = uidToCardNumber(Uint8Array.from([0x01, 0x00, 0x00, 0x00]))
    expect(result).toEqual({ ok: true, cardNumber: "0000000001" })
  })

  test("maps the maximum 4-byte UID without losing precision", () => {
    const result = uidToCardNumber(Uint8Array.from([0xff, 0xff, 0xff, 0xff]))
    expect(result).toEqual({ ok: true, cardNumber: "4294967295" })
  })

  test("accepts a plain number array, not just a typed array", () => {
    expect(uidToCardNumber([0x75, 0xb3, 0x8d, 0x5e])).toEqual({
      ok: true,
      cardNumber: "1586344821",
    })
  })

  test("rejects a UID that is not four bytes", () => {
    expect(uidToCardNumber(Uint8Array.from([0x04, 0x8d, 0x5e]))).toEqual({
      ok: false,
      reason: "unsupported_length",
    })
    expect(
      uidToCardNumber(
        Uint8Array.from([0x04, 0x8d, 0x5e, 0x12, 0x34, 0x56, 0x78])
      )
    ).toEqual({ ok: false, reason: "unsupported_length" })
  })

  test("rejects a random UID that starts with 0x08", () => {
    expect(uidToCardNumber(Uint8Array.from([0x08, 0x11, 0x22, 0x33]))).toEqual({
      ok: false,
      reason: "random_uid",
    })
  })
})
