import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { PortalShell } from "@/components/portal-shell"

export default function NotFound() {
  return (
    <PortalShell appName="Portal">
      <div className="flex min-h-[60vh] flex-col justify-center gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium">找不到頁面</h1>
          <p className="text-sm text-muted-foreground">
            這個網址不存在，或內容已經被移除。
          </p>
        </div>
        <div>
          <Button asChild>
            <Link href="/">回首頁</Link>
          </Button>
        </div>
      </div>
    </PortalShell>
  )
}
