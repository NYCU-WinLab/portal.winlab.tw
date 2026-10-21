import { describe, expect, test } from "bun:test"

import { credentialErrorMessage, readGroupsConfig } from "@/lib/groups/config"

const full = {
  GOOGLE_GROUPS_WIF_AUDIENCE:
    "//iam.googleapis.com/projects/408573309626/locations/global/workloadIdentityPools/vercel/providers/vercel",
  GOOGLE_GROUPS_SA_EMAIL: "portal-groups@winlab-portal.iam.gserviceaccount.com",
  GOOGLE_GROUPS_DOMAIN: " WinLab.tw ",
}

describe("readGroupsConfig", () => {
  test("all three set gives a config, domain normalised", () => {
    expect(readGroupsConfig(full)).toEqual({
      audience: full.GOOGLE_GROUPS_WIF_AUDIENCE,
      saEmail: full.GOOGLE_GROUPS_SA_EMAIL,
      domain: "winlab.tw",
    })
  })

  test("any one missing or blank means unconfigured", () => {
    for (const key of Object.keys(full) as (keyof typeof full)[]) {
      expect(readGroupsConfig({ ...full, [key]: undefined })).toBeNull()
      expect(readGroupsConfig({ ...full, [key]: "  " })).toBeNull()
    }
  })
})

describe("credentialErrorMessage", () => {
  test("names the environment, and says only production can get a token", () => {
    const msg = credentialErrorMessage("preview")
    expect(msg).toContain("preview")
    expect(msg).toContain("production")
    expect(msg).not.toContain("STS")
  })

  test("outside Vercel it says local", () => {
    expect(credentialErrorMessage(undefined)).toContain("本機")
  })
})
