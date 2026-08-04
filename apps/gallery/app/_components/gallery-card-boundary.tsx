"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

import { gallerySans, gallerySerif } from "@/components/gallery-chrome"

type Props = {
  children: ReactNode
  fallbackLabel?: string
}

type State = {
  hasError: boolean
}

/** Isolates a single polaroid so one bad media item doesn't blank the wall. */
export class GalleryCardBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("GalleryCardBoundary", error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={cn(
            "mx-auto flex w-full max-w-[16rem] flex-col items-center justify-center rounded-[3px] border border-zinc-900/10 bg-[#fafafa] px-4 py-10 text-center shadow-sm"
          )}
          role="status"
        >
          <p className={cn(gallerySerif(), "text-sm text-foreground/80")}>
            {this.props.fallbackLabel ?? "This polaroid tore"}
          </p>
          <p
            className={cn(
              gallerySans(),
              "mt-1 text-[11px] text-muted-foreground"
            )}
          >
            Refresh the wall to try again.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
