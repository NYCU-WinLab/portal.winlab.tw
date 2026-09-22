// /door is installable to a phone home screen. Two settings make that work and
// both fail silently when broken — nothing throws, no test elsewhere notices,
// and the damage only shows up on a real phone the next time someone installs
// the app. The manifest is JSON, so it cannot carry the comment explaining
// itself; this file is that comment.

import { describe, expect, test } from "bun:test"

import { config } from "@/proxy"

const manifest = await Bun.file(
  new URL("../../public/door/manifest.webmanifest", import.meta.url)
).json()

// The proxy runs on every path its matcher matches, so "does the proxy gate
// this?" is just the matcher applied to a pathname.
const gated = (pathname: string) =>
  config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname))

describe("door home-screen install", () => {
  // An installed web app on iOS gets its own cookie jar, so its first launch
  // always lands on /auth/login — outside /door. iOS hands an out-of-scope
  // navigation to Safari, which writes the session cookie to Safari's jar and
  // leaves the installed app logged out forever. Scope "/" keeps the Keycloak
  // round trip inside the installed app.
  test("scope covers the auth routes, not just /door", () => {
    expect(manifest.scope).toBe("/")
    expect(manifest.start_url).toBe("/door")
  })

  // A browser refetches the manifest when it judges installability and when it
  // launches an installed app, both with a possibly empty cookie jar. Gated by
  // the proxy, those fetches get a redirect to HTML and /door quietly loses its
  // standalone launch.
  test("proxy leaves .webmanifest unauthenticated", () => {
    expect(gated("/door/manifest.webmanifest")).toBe(false)
  })

  // The other half of that exclusion: widening it must never let the door
  // itself out of the gate. This is the assertion that turns a careless regex
  // edit into a red test instead of an unauthenticated door button.
  test("the door page itself stays gated", () => {
    expect(gated("/door")).toBe(true)
    expect(gated("/door/admin")).toBe(true)
    expect(gated("/door/log")).toBe(true)
  })

  // Chrome refuses to offer an install without a 192px icon; iOS uses the 180.
  test("ships the icon sizes the two platforms actually require", () => {
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
    expect(sizes).toContain("192x192")
    expect(sizes).toContain("512x512")
    expect(sizes).toContain("180x180")
  })

  test("display mode drops the browser chrome", () => {
    expect(manifest.display).toBe("standalone")
  })
})
