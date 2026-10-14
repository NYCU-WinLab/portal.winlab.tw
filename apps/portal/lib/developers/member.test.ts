import { expect, test } from "bun:test"
import { readIdentity } from "./member"
const member = {
  username: "member",
  email: "member@example.org",
  enabled: true,
  firstName: "Given",
  lastName: "Family",
  attributes: { chinese_name: ["成員姓名"], phone: ["private"] },
}
test("profile and name responses have explicit field allowlists", async () => {
  expect(await readIdentity("profile", async () => member)).toEqual({
    username: "member",
    email: "member@example.org",
  })
  expect(await readIdentity("name", async () => member)).toEqual({
    username: "member",
    name: "成員姓名",
  })
})
test("group reads are paginated and exclude infrastructure memberships", async () => {
  const calls: string[] = []
  const data = await readIdentity("groups", async (suffix) => {
    calls.push(suffix)
    if (suffix === "") return member
    if (suffix.includes("first=0&"))
      return Array.from({ length: 100 }, (_, i) => ({
        name: `group${i}`,
        path: `/winlab-projects/group${i}`,
      }))
    return [
      { name: "114", path: "/lab-member/114" },
      { name: "root", path: "/infrastructure/root" },
    ]
  })
  expect("groups" in data && data.groups).toHaveLength(101)
  expect(calls).toEqual([
    "",
    "/groups?first=0&max=100",
    "/groups?first=100&max=100",
  ])
})
test("disabled users and failed group sources deny access instead of returning empty memberships", async () => {
  await expect(
    readIdentity("profile", async () => ({ ...member, enabled: false }))
  ).rejects.toThrow()
  await expect(
    readIdentity("groups", async (suffix) => {
      if (suffix) throw Error("upstream failure")
      return member
    })
  ).rejects.toThrow("upstream failure")
})
