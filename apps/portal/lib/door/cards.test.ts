import { describe, expect, test } from "bun:test"

import {
  big5ByteLength,
  deriveHolder,
  diffControllerCards,
  groupCardsByHolder,
  hamsErrorMessage,
  isValidCardId,
  maskCardId,
  mergeDoorCards,
  planHolderCardWrites,
  planImport,
  planReconcile,
  uidToCardNumber,
  validateCardId,
  validateHolderName,
  type DoorCardRow,
  type DoorCardView,
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
    expect(planReconcile([row("0000000001")], [], 0).drifted).toBe(true)
    expect(planReconcile([], [card("0000000009")], 1).drifted).toBe(true)
  })

  test("an absurd card count blocks the sync_state write", () => {
    const plan = planReconcile([row("0000000001")], [card("0000000001")], 10240)
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

describe("deriveHolder", () => {
  test("member selection carries the member id and the member's own name", () => {
    expect(
      deriveHolder({
        kind: "member",
        member: { id: "u-1", name: "蔣汶儒" },
      })
    ).toEqual({ holder_name: "蔣汶儒", holder_user_id: "u-1" })
  })

  test("member name is trimmed so the controller label has no stray spaces", () => {
    expect(
      deriveHolder({
        kind: "member",
        member: { id: "u-2", name: "  Kai Kuo  " },
      })
    ).toEqual({ holder_name: "Kai Kuo", holder_user_id: "u-2" })
  })

  test("a member with no name resolves to an empty label the form must reject", () => {
    expect(
      deriveHolder({ kind: "member", member: { id: "u-3", name: null } })
    ).toEqual({ holder_name: "", holder_user_id: "u-3" })
  })

  test("guest selection has no member id and uses the typed label", () => {
    expect(deriveHolder({ kind: "guest", label: "  訪客卡  " })).toEqual({
      holder_name: "訪客卡",
      holder_user_id: null,
    })
  })
})

function view(
  card_id: string,
  extra: Partial<DoorCardView> = {}
): DoorCardView {
  return {
    card_id,
    holder_name: "某人",
    holder_user_id: null,
    note: null,
    sync_state: "synced",
    last_seen_at: null,
    controller_name: null,
    in_database: true,
    ...extra,
  }
}

describe("groupCardsByHolder", () => {
  const members = [
    { id: "u-1", name: "蔣汶儒", email: "wr@example.com" },
    { id: "u-2", name: null, email: "kai@example.com" },
  ]

  test("a member's several cards fold into one holder row", () => {
    const groups = groupCardsByHolder(
      [
        view("0000000001", { holder_user_id: "u-1", holder_name: "蔣汶儒" }),
        view("0000000002", { holder_user_id: "u-1", holder_name: "蔣汶儒" }),
      ],
      members
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.holderUserId).toBe("u-1")
    expect(groups[0]!.displayName).toBe("蔣汶儒")
    expect(groups[0]!.cardIds).toEqual(["0000000001", "0000000002"])
  })

  test("two distinct guest labels are two holders", () => {
    const groups = groupCardsByHolder(
      [
        view("0000000010", { holder_name: "訪客A" }),
        view("0000000011", { holder_name: "訪客B" }),
      ],
      members
    )
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.holderName).sort()).toEqual(["訪客A", "訪客B"])
    expect(groups.every((g) => g.holderUserId === null)).toBe(true)
  })

  test("a member with no name falls back to email for the label", () => {
    const groups = groupCardsByHolder(
      [view("0000000020", { holder_user_id: "u-2", holder_name: "Kai" })],
      members
    )
    expect(groups[0]!.displayName).toBe("kai@example.com")
  })

  test("aggregate sync is synced only when every card is", () => {
    const [group] = groupCardsByHolder(
      [
        view("0000000030", { holder_user_id: "u-1", sync_state: "synced" }),
        view("0000000031", {
          holder_user_id: "u-1",
          sync_state: "missing_on_controller",
        }),
      ],
      members
    )
    expect(group!.syncState).toBe("missing_on_controller")
  })

  test("aggregate surfaces a missing card over an unknown one", () => {
    const [group] = groupCardsByHolder(
      [
        view("0000000040", {
          holder_name: "訪客",
          sync_state: "unknown_on_controller",
          in_database: false,
        }),
        view("0000000041", {
          holder_name: "訪客",
          sync_state: "missing_on_controller",
        }),
      ],
      members
    )
    expect(group!.syncState).toBe("missing_on_controller")
    expect(group!.inDatabase).toBe(true)
  })

  test("a holder made only of controller-only cards is not in the database", () => {
    const [group] = groupCardsByHolder(
      [
        view("0000000050", {
          holder_name: "陌生卡",
          sync_state: "unknown_on_controller",
          in_database: false,
        }),
      ],
      members
    )
    expect(group!.inDatabase).toBe(false)
    expect(group!.syncState).toBe("unknown_on_controller")
  })

  test("all synced cards report a synced holder", () => {
    const [group] = groupCardsByHolder(
      [
        view("0000000060", { holder_user_id: "u-1", sync_state: "synced" }),
        view("0000000061", { holder_user_id: "u-1", sync_state: "synced" }),
      ],
      members
    )
    expect(group!.syncState).toBe("synced")
  })
})

describe("planHolderCardWrites", () => {
  function existing(
    card_id: string,
    extra: Partial<
      Pick<DoorCardRow, "holder_name" | "holder_user_id" | "note">
    > = {}
  ) {
    return {
      card_id,
      holder_name: "蔣汶儒",
      holder_user_id: "u-1" as string | null,
      note: null as string | null,
      ...extra,
    }
  }

  test("a new card number is an add", () => {
    const plan = planHolderCardWrites([existing("0000000001")], {
      cardIds: ["0000000001", "0000000002"],
      holderName: "蔣汶儒",
      holderUserId: "u-1",
      note: null,
    })
    expect(plan.add).toEqual(["0000000002"])
    expect(plan.remove).toEqual([])
    expect(plan.rename).toEqual([])
    expect(plan.updateMeta).toEqual([])
  })

  test("a dropped card number is a remove", () => {
    const plan = planHolderCardWrites(
      [existing("0000000001"), existing("0000000002")],
      {
        cardIds: ["0000000001"],
        holderName: "蔣汶儒",
        holderUserId: "u-1",
        note: null,
      }
    )
    expect(plan.remove).toEqual(["0000000002"])
    expect(plan.add).toEqual([])
  })

  test("a kept card whose label changed is a rename", () => {
    const plan = planHolderCardWrites([existing("0000000001")], {
      cardIds: ["0000000001"],
      holderName: "Kai Kuo",
      holderUserId: "u-2",
      note: null,
    })
    expect(plan.rename).toEqual(["0000000001"])
    expect(plan.updateMeta).toEqual([])
  })

  test("a kept card with the same label but a new note is a portal-only update", () => {
    const plan = planHolderCardWrites([existing("0000000001")], {
      cardIds: ["0000000001"],
      holderName: "蔣汶儒",
      holderUserId: "u-1",
      note: "備用卡",
    })
    expect(plan.rename).toEqual([])
    expect(plan.updateMeta).toEqual(["0000000001"])
  })

  test("a kept card that changed nothing is in no list", () => {
    const plan = planHolderCardWrites(
      [existing("0000000001", { note: "備用卡" })],
      {
        cardIds: ["0000000001"],
        holderName: "蔣汶儒",
        holderUserId: "u-1",
        note: "備用卡",
      }
    )
    expect(plan.add).toEqual([])
    expect(plan.remove).toEqual([])
    expect(plan.rename).toEqual([])
    expect(plan.updateMeta).toEqual([])
  })

  test("empty and whitespace notes compare equal, not a spurious update", () => {
    const plan = planHolderCardWrites(
      [existing("0000000001", { note: null })],
      {
        cardIds: ["0000000001"],
        holderName: "蔣汶儒",
        holderUserId: "u-1",
        note: "   ",
      }
    )
    expect(plan.updateMeta).toEqual([])
  })

  test("duplicate submitted numbers collapse to one add", () => {
    const plan = planHolderCardWrites([], {
      cardIds: ["0000000005", "0000000005"],
      holderName: "訪客",
      holderUserId: null,
      note: "訪客",
    })
    expect(plan.add).toEqual(["0000000005"])
  })

  test("switching a guest to a member renames and drops the note diff into the rename", () => {
    const plan = planHolderCardWrites(
      [existing("0000000001", { holder_name: "訪客", holder_user_id: null })],
      {
        cardIds: ["0000000001"],
        holderName: "蔣汶儒",
        holderUserId: "u-1",
        note: null,
      }
    )
    expect(plan.rename).toEqual(["0000000001"])
    expect(plan.updateMeta).toEqual([])
  })
})
