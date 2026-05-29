import { describe, expect, test } from "bun:test"

import {
  FIELD_CATEGORIES,
  getCategoryDef,
  isPredefined,
} from "@/lib/approve/field-categories"
import type { FieldCategory } from "@/lib/approve/types"

describe("getCategoryDef", () => {
  test("returns the matching definition for each known category", () => {
    for (const def of FIELD_CATEGORIES) {
      expect(getCategoryDef(def.id)).toBe(def)
    }
  })

  test("returns a def carrying id, label, icon, predefined, and defaultSize", () => {
    const def = getCategoryDef("signature")
    expect(def.id).toBe("signature")
    expect(def.label).toBe("簽名")
    expect(def.predefined).toBe(true)
    expect(def.defaultSize).toEqual({ width: 0.2, height: 0.08 })
    expect(typeof def.icon).toBe("object")
  })

  test("throws for an unknown category id", () => {
    expect(() => getCategoryDef("nope" as FieldCategory)).toThrow(
      "Unknown field category: nope"
    )
  })
})

describe("isPredefined", () => {
  test("returns true for every non-other category", () => {
    const predefined: FieldCategory[] = [
      "signature",
      "contact_address",
      "household_address",
      "id_number",
      "phone",
    ]
    for (const id of predefined) {
      expect(isPredefined(id)).toBe(true)
    }
  })

  test("returns false only for other", () => {
    expect(isPredefined("other")).toBe(false)
  })

  test("agrees with each category def's predefined flag", () => {
    for (const def of FIELD_CATEGORIES) {
      expect(isPredefined(def.id)).toBe(def.predefined)
    }
  })

  test("other is the only category flagged non-predefined", () => {
    const nonPredefined = FIELD_CATEGORIES.filter((c) => !c.predefined)
    expect(nonPredefined.map((c) => c.id)).toEqual(["other"])
  })
})
