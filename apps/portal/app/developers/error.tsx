"use client"
import { Button } from "@workspace/ui/components/button"
export default function DeveloperError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4 py-12">
      <h1 className="font-medium">開發者平台暫時無法使用</h1>
      <p className="text-sm text-muted-foreground">
        資料未能載入，請稍後重試。
      </p>
      <Button onClick={reset} variant="outline">
        重試
      </Button>
    </div>
  )
}
