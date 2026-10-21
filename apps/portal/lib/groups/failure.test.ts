import { describe, expect, test } from "bun:test"

import {
  describeError,
  failure,
  isFatal,
  PERMISSION_MESSAGE,
  UNEXPECTED_MESSAGE,
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
      expect(res.detail).toContain(`Google ${status}`)
      expect(res.detail).not.toContain("Not Authorized")
    }
  })

  test("no token is an error that keeps its explanation but not the STS cause", () => {
    const err = new GroupsCredentialError(
      "無法取得 Google 權杖（目前環境：preview）",
      "STS 403 invalid_grant"
    )
    expect(failure(err)).toEqual({
      status: "error",
      detail: "無法取得 Google 權杖（目前環境：preview）",
    })
    expect(describeError(err)).toContain("STS 403 invalid_grant")
  })

  test("any other Google status, and anything else, is error", () => {
    expect(failure(new GoogleGroupsError(503, "backend"))).toEqual({
      status: "error",
      detail: "Google 503（error）",
    })
    expect(
      failure(new GoogleGroupsError(400, "secret upstream text", "invalid"))
    ).toEqual({ status: "error", detail: "Google 400（invalid）" })
    expect(failure(new Error("PostgREST: relation x"))).toEqual({
      status: "error",
      detail: UNEXPECTED_MESSAGE,
    })
    expect(failure("weird")).toEqual({
      status: "error",
      detail: UNEXPECTED_MESSAGE,
    })
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
  test("keeps Google's own words for the audit detail (never shown)", () => {
    expect(
      describeError(new GoogleGroupsError(400, "Invalid Input: memberKey"))
    ).toBe("Google 400：Invalid Input: memberKey")
    expect(describeError(new GoogleGroupsError(500))).toBe("Google 500")
  })
})

describe("failure's sent flag", () => {
  test("is passed through, and left out when unknown", () => {
    expect(failure(new Error("x"), false)).toMatchObject({ sent: false })
    expect(failure(new Error("x"), true)).toMatchObject({ sent: true })
    expect("sent" in failure(new Error("x"))).toBe(false)
    expect(failure(new GoogleGroupsError(403, "d"), false)).toMatchObject({
      reason: "google_permission",
      sent: false,
    })
  })
})
