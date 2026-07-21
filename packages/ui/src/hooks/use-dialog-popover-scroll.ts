"use client"

import { useCallback } from "react"

/**
 * Restores wheel / touch scrolling for a Popover (or any portalled overlay)
 * whose content lives inside a scroll-locked Radix Dialog.
 *
 * Radix Dialog installs `react-remove-scroll`, which registers a document-level
 * wheel / touchmove listener that `preventDefault`s events originating outside
 * the dialog subtree. A Popover portals its content to `<body>`, i.e. outside
 * that subtree, so its `overflow-y-auto` list stops scrolling even though the
 * scrollbar is there.
 *
 * Stopping the event on the popover node — before it bubbles up to the document
 * listener — means `react-remove-scroll` never sees it and never preventDefaults,
 * so the browser scrolls the popover's own overflow area natively. A React
 * `onWheel` handler can't do this: both listeners sit on `document`, and
 * `stopPropagation` doesn't stop a sibling listener on the same target.
 *
 * Returns a callback ref to attach to the popover content element.
 */
export function useDialogPopoverScroll<T extends HTMLElement>() {
  return useCallback((node: T | null) => {
    if (!node) return
    const stop = (event: Event) => event.stopPropagation()
    node.addEventListener("wheel", stop, { passive: true })
    node.addEventListener("touchmove", stop, { passive: true })
    return () => {
      node.removeEventListener("wheel", stop)
      node.removeEventListener("touchmove", stop)
    }
  }, [])
}
