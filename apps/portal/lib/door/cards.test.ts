import { describe, expect, test } from "bun:test"

import {
  big5ByteLength,
  diffControllerCards,
  hamsErrorMessage,
  isValidCardId,
  maskCardId,
  mergeDoorCards,
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
  return { card_id, name, time_index: 1, status: "active" }
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
