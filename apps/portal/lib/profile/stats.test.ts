import { describe, expect, test } from "bun:test"

import {
  formatBytes,
  formatDelay,
  leaveFlavor,
  spendInReference,
} from "@/lib/profile/stats"

describe("formatBytes", () => {
  test("zero bytes stays in the B bucket", () => {
    expect(formatBytes(0)).toBe("0 B")
  })

  test("just under 1 KiB reports raw bytes", () => {
    expect(formatBytes(1023)).toBe("1023 B")
  })

  test("exactly 1024 crosses into KB (1.0)", () => {
    expect(formatBytes(1024)).toBe("1.0 KB")
  })

  test("KB rounds to one decimal", () => {
    expect(formatBytes(1536)).toBe("1.5 KB")
  })

  test("just under 1 MiB stays KB", () => {
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB")
  })

  test("exactly 1 MiB crosses into MB (1.0)", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB")
  })

  test("MB rounds to one decimal", () => {
    expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.5 MB")
  })

  test("just under 1 GiB stays MB", () => {
    expect(formatBytes(1024 * 1024 * 1024 - 1)).toBe("1024.0 MB")
  })

  test("exactly 1 GiB crosses into GB with two decimals", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB")
  })

  test("GB rounds to two decimals", () => {
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe("2.50 GB")
  })
})

describe("formatDelay", () => {
  test("zero seconds renders the em dash", () => {
    expect(formatDelay(0)).toBe("—")
  })

  test("negative seconds renders the em dash", () => {
    expect(formatDelay(-100)).toBe("—")
  })

  test("under an hour reports rounded minutes", () => {
    // 1800s = 30 min, hours = 0.5 < 1
    expect(formatDelay(1800)).toBe("30 分")
  })

  test("minutes are rounded, not floored", () => {
    // 90s / 60 = 1.5 -> Math.round -> 2
    expect(formatDelay(90)).toBe("2 分")
  })

  test("just under an hour still reports minutes", () => {
    // 3599s -> 59.98 min -> round 60
    expect(formatDelay(3599)).toBe("60 分")
  })

  test("exactly one hour crosses into the 小時 bucket", () => {
    // hours = 1, not < 1, and < 48
    expect(formatDelay(3600)).toBe("1.0 小時")
  })

  test("hours render with one decimal", () => {
    // 5400s = 1.5h
    expect(formatDelay(5400)).toBe("1.5 小時")
  })

  test("just under 48 hours stays in the 小時 bucket", () => {
    // 47.99h
    expect(formatDelay(172800 - 3600)).toBe("47.0 小時")
  })

  test("exactly 48 hours crosses into the 天 bucket", () => {
    // hours = 48, not < 48 -> days = 48/24 = 2.0
    expect(formatDelay(172800)).toBe("2.0 天")
  })

  test("days render with one decimal", () => {
    // 216000s = 60h = 2.5 days
    expect(formatDelay(216000)).toBe("2.5 天")
  })
})

describe("leaveFlavor", () => {
  test("zero days is the work-machine line", () => {
    expect(leaveFlavor(0)).toBe("今年還沒請過假，是個工作機器")
  })

  test("one day is in the 發育期 bucket", () => {
    expect(leaveFlavor(1)).toBe("1 天，還在發育期")
  })

  test("just under three days stays 發育期", () => {
    expect(leaveFlavor(2)).toBe("2 天，還在發育期")
  })

  test("exactly three days crosses into the 環島 bucket", () => {
    // 3/9 = 0.333... -> toFixed(1) -> "0.3"
    expect(leaveFlavor(3)).toBe("3 天，可以單車環島 0.3 圈")
  })

  test("nine days is exactly one lap", () => {
    expect(leaveFlavor(9)).toBe("9 天，可以單車環島 1.0 圈")
  })

  test("laps render with one decimal", () => {
    // 18/9 = 2.0
    expect(leaveFlavor(18)).toBe("18 天，可以單車環島 2.0 圈")
  })
})

describe("spendInReference", () => {
  const egg = { name: "7-11 茶葉蛋", price: 10, unit: "顆" }

  test("exact multiple divides cleanly", () => {
    expect(spendInReference(100, egg)).toBe(10)
  })

  test("remainder is floored down", () => {
    expect(spendInReference(99, egg)).toBe(9)
  })

  test("spending less than one unit floors to zero", () => {
    expect(spendInReference(9, egg)).toBe(0)
  })

  test("zero spend is zero units", () => {
    expect(spendInReference(0, egg)).toBe(0)
  })

  test("floors against an arbitrary price", () => {
    // 200 / 75 = 2.66... -> floor 2
    expect(
      spendInReference(200, { name: "麥當勞大麥克", price: 75, unit: "顆" })
    ).toBe(2)
  })
})
