import { expect, test } from "bun:test"

import { SCOPES } from "@/lib/groups/scopes"

test("the token is limited to reading groups and changing their members", () => {
  expect([...SCOPES].sort()).toEqual([
    "https://www.googleapis.com/auth/admin.directory.group.member",
    "https://www.googleapis.com/auth/admin.directory.group.readonly",
  ])
})
