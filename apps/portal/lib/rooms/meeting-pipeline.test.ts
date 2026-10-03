import { describe, expect, test } from "bun:test"

import { cancelPipelineVariables } from "./meeting-pipeline"

describe("cancelPipelineVariables", () => {
  test("keeps callback identity separate from the original booking request", () => {
    const variables = cancelPipelineVariables({
      bookingId: "booking-1",
      bookingRequestId: "create-request-1",
      title: "[radio]-meeting",
      groupName: "radio",
      issueRefs: ["winlab/radio&8"],
      cancelId: "040000008200e00074c5b7101a82e008",
      messageId: "channel-message-1",
      start: "2026-09-14T09:00:00+08:00",
      reason: "cancelled",
    })

    expect(variables).toEqual({
      ACTION: "cancel",
      BOOKING_REQUEST_ID: "create-request-1",
      EVENT_ID: "040000008200e00074c5b7101a82e008",
      MESSAGE_ID: "channel-message-1",
      START_TIME: "2026-09-14T09:00:00+08:00",
      SUBJECT: "[radio]-meeting",
      GROUP_NAME: "radio",
      ISSUE_REFS: "winlab/radio&8",
      CANCELLATION_MESSAGE: "cancelled",
    })
    expect(variables).not.toHaveProperty("REQUEST_ID")
  })

  test("omits optional context instead of sending empty values", () => {
    const variables = cancelPipelineVariables({
      bookingId: "booking-2",
      bookingRequestId: "create-request-2",
      title: "personal-meeting",
      cancelId: "cancel-id",
      messageId: "message-id",
      start: "2026-09-14T09:00:00+08:00",
    })

    expect(variables).not.toHaveProperty("GROUP_NAME")
    expect(variables).not.toHaveProperty("ISSUE_REFS")
    expect(variables).not.toHaveProperty("CANCELLATION_MESSAGE")
  })
})
