import { describe, expect, test } from "bun:test"

import {
  describeError,
  failure,
  isFatal,
  PERMISSION_MESSAGE,
} from "@/lib/groups/failure"
import { GoogleGroupsError, GroupsCredentialError } from "@/lib/groups/google"

describe("failure", () => {
  test("Google refusing the service account is a permission problem, said plainly", () => {
    for (const status of [401, 403]) {
      const res = failure(
        new GoogleGroupsError(
          status,
          "Not Authorized to access this resource/api"
        )
      )
      expect(res.status).toBe("forbidden")
      if (res.status !== "forbidden") return
      expect(res.reason).toBe("google_permission")
      expect(res.detail).toContain(PERMISSION_MESSAGE)
      expect(res.detail).toContain("Not Authorized")
    }
  })

  test("no token is an error that keeps its explanation", () => {
    expect(
      failure(
        new GroupsCredentialError("無法取得 Google 權杖（目前環境：preview）")
      )
    ).toEqual({
      status: "error",
      detail: "無法取得 Google 權杖（目前環境：preview）",
    })
  })

  test("any other Google status, and anything else, is error", () => {
    expect(failure(new GoogleGroupsError(503, "backend"))).toEqual({
      status: "error",
      detail: "Google 503：backend",
    })
    expect(failure(new Error("boom"))).toEqual({
      status: "error",
      detail: "boom",
    })
    expect(failure("weird")).toEqual({ status: "error", detail: "unknown" })
  })
})

describe("isFatal", () => {
  test("only credential and permission failures stop a batch", () => {
    expect(isFatal(new GroupsCredentialError("x"))).toBe(true)
    expect(isFatal(new GoogleGroupsError(403))).toBe(true)
    expect(isFatal(new GoogleGroupsError(401))).toBe(true)
    expect(
      isFatal(new GoogleGroupsError(400, "Invalid Input: memberKey"))
    ).toBe(false)
    expect(isFatal(new GoogleGroupsError(503))).toBe(false)
    expect(isFatal(new Error("x"))).toBe(false)
  })
})

describe("describeError", () => {
  test("keeps Google's own words for the audit detail", () => {
    expect(
      describeError(new GoogleGroupsError(400, "Invalid Input: memberKey"))
    ).toBe("Google 400：Invalid Input: memberKey")
    expect(describeError(new GoogleGroupsError(500))).toBe("Google 500")
  })
})
