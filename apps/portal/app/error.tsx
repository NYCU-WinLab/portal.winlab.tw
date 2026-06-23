"use client"

import { useEffect } from "react"

import { Button } from "@workspace/ui/components/button"

import { PortalShell } from "@/components/portal-shell"

// Root error boundary. Business apps have no error.tsx of their own, so any
// thrown render/server error bubbles here instead of Next.js's bare 500.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[portal] route error", error)
  }, [error])

  return (
    <PortalShell appName="Portal">
      <div className="flex min-h-[60vh] flex-col justify-center gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">出了點問題</h1>
          <p className="text-sm text-muted-foreground">
            這個頁面載入失敗了，再試一次通常就好。
            {error.digest ? (
              <span className="text-muted-foreground/60">
                {" "}
                (代碼 {error.digest})
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={reset}>重試</Button>
          <Button variant="outline" asChild>
            <a href="/">回首頁</a>
          </Button>
        </div>
      </div>
    </PortalShell>
  )
}
