import { describe, expect, test } from "bun:test"

import {
  computeReimburseBalance,
  egressStatus,
  filterLedgerRows,
  toLedgerRows,
} from "@/lib/reimburse/ledger"
import type { Ingress, Reimbursement } from "@/lib/reimburse/types"

function egress(over: Partial<Reimbursement> = {}): Reimbursement {
  return {
    id: "e1",
    applicantName: "Loki",
    itemName: "Cables",
    itemAmount: 1200,
    invoiceDate: "2026-03-02",
    transferDate: null,
    transferFee: null,
    ...over,
  }
}

function ingress(over: Partial<Ingress> = {}): Ingress {
  return {
    id: "i1",
    ingressDate: "2026-03-01",
    ingressAmount: 5000,
    ingressComment: "Lab budget",
    ...over,
  }
}

describe("egressStatus", () => {
  test("is pending until a transfer date is recorded", () => {
    expect(egressStatus(egress())).toBe("pending")
    expect(egressStatus(egress({ transferDate: "2026-03-10" }))).toBe(
      "transferred"
    )
  })
})

describe("toLedgerRows", () => {
  test("merges both tables newest first", () => {
    const rows = toLedgerRows(
      [
        egress({ id: "e1", invoiceDate: "2026-01-05" }),
        egress({ id: "e2", invoiceDate: "2026-03-20" }),
      ],
      [ingress({ id: "i1", ingressDate: "2026-02-10" })]
    )
    expect(rows.map((r) => r.id)).toEqual(["e2", "i1", "e1"])
  })

  test("signs egress negative and keeps the transfer fee separate", () => {
    const [row] = toLedgerRows(
      [egress({ itemAmount: 1200, transferFee: 15 })],
      []
    )
    expect(row).toMatchObject({
      kind: "egress",
      amount: -1200,
      transfer_fee: 15,
      name: "Cables",
      applicant: "Loki",
      status: "pending",
      status_label: "未轉帳",
    })
  })

  test("keeps ingress positive with the comment as its name", () => {
    const [row] = toLedgerRows([], [ingress()])
    expect(row).toMatchObject({
      kind: "ingress",
      amount: 5000,
      name: "Lab budget",
      status: null,
      status_label: null,
      applicant: null,
      transfer_fee: null,
    })
  })

  test("labels a transferred egress row", () => {
    const [row] = toLedgerRows([egress({ transferDate: "2026-03-10" })], [])
    expect(row!.status_label).toBe("已轉帳")
  })
})

describe("filterLedgerRows", () => {
  const rows = toLedgerRows(
    [
      egress({ id: "e1", invoiceDate: "2026-01-05" }),
      egress({
        id: "e2",
        invoiceDate: "2026-03-20",
        transferDate: "2026-03-25",
      }),
    ],
    [ingress({ id: "i1", ingressDate: "2026-02-10" })]
  )

  test("returns everything by default", () => {
    expect(filterLedgerRows(rows, {}).length).toBe(3)
  })

  test("filters by kind", () => {
    expect(
      filterLedgerRows(rows, { kind: "ingress" }).map((r) => r.id)
    ).toEqual(["i1"])
  })

  test("filters by an inclusive date window", () => {
    const window = filterLedgerRows(rows, {
      from: "2026-02-10",
      to: "2026-03-20",
    })
    expect(window.map((r) => r.id)).toEqual(["e2", "i1"])
  })

  test("status never matches an ingress row", () => {
    expect(
      filterLedgerRows(rows, { status: "transferred" }).map((r) => r.id)
    ).toEqual(["e2"])
    expect(
      filterLedgerRows(rows, { status: "pending" }).map((r) => r.id)
    ).toEqual(["e1"])
  })
})

describe("computeReimburseBalance", () => {
  test("counts transfer fees against the balance, like the page badge", () => {
    const balance = computeReimburseBalance(
      [
        egress({ id: "e1", itemAmount: 1200, transferFee: 15 }),
        egress({
          id: "e2",
          itemAmount: 800,
          transferFee: null,
          transferDate: "2026-03-10",
        }),
      ],
      [ingress({ ingressAmount: 5000 })]
    )
    expect(balance).toEqual({
      ingress_total: 5000,
      egress_item_total: 2000,
      egress_transfer_fee_total: 15,
      egress_total: 2015,
      balance: 2985,
      ingress_count: 1,
      egress_count: 2,
      egress_counts_by_status: { transferred: 1, pending: 1 },
      pending_amount: 1215,
      pending_count: 1,
    })
  })

  test("is all zeros for an empty ledger", () => {
    const balance = computeReimburseBalance([], [])
    expect(balance.balance).toBe(0)
    expect(balance.egress_counts_by_status).toEqual({
      transferred: 0,
      pending: 0,
    })
  })
})
