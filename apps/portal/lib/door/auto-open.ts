// /door/go opens the door on load — it is what the home-screen icon launches,
// so the tap on the icon is the tap that opens the door. That makes "did the
// person just ask for this?" a physical-security question rather than a
// rendering one, and the browser's own answer is the navigation type.
//
// A home-screen launch is a fresh "navigate". A reload, a back/forward restore
// or a prerender is the page coming back on its own, and a door must never
// open because a browser decided to re-run a component.

export type DoorLaunchKind = PerformanceNavigationTiming["type"]

export function shouldAutoOpen(kind: DoorLaunchKind | undefined): boolean {
  return kind === "navigate"
}

// Reading it is its own step because the entry is missing in older browsers and
// under some privacy modes, and "I could not tell" must not read as "yes".
export function readLaunchKind(
  perf: Pick<Performance, "getEntriesByType">
): DoorLaunchKind | undefined {
  const [entry] = perf.getEntriesByType(
    "navigation"
  ) as PerformanceNavigationTiming[]
  return entry?.type
}

// Tapping the icon of an app iOS still has in memory does not navigate
// anywhere — it just brings the page back to the front. Nothing mounts, no
// navigation entry appears, so shouldAutoOpen above never gets a second
// chance. Without this the icon opens the door the first time and behaves
// like a plain bookmark every time after, which is worse than never
// promising one tap at all.
//
// The cost is that any return to the foreground opens the door, including
// arriving here through the app switcher. That is the honest shape of "the
// icon is the door button": the app coming to the front IS the request.
// `idle` is what keeps it to one open at a time — an open already running or
// still showing its result is not a new request.
export function shouldOpenOnResume(
  visibility: DocumentVisibilityState,
  idle: boolean
): boolean {
  return visibility === "visible" && idle
}
