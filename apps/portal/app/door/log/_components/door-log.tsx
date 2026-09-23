import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import type { DoorEvent } from "@/lib/door/audit"

const formatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

export function DoorLog({ events }: { events: DoorEvent[] }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold">開門紀錄</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">時間</TableHead>
            <TableHead>誰</TableHead>
            <TableHead className="w-24">結果</TableHead>
            <TableHead className="w-24 text-right">耗時</TableHead>
            <TableHead className="w-44">來源</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-10 text-center text-sm text-muted-foreground"
              >
                尚無紀錄
              </TableCell>
            </TableRow>
          ) : (
            events.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono text-xs tabular-nums">
                  {formatter.format(new Date(e.created_at))}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{e.user_name}</div>
                  {e.user_email && (
                    <div className="text-xs text-muted-foreground">
                      {e.user_email}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "text-sm",
                      e.ok ? "text-foreground" : "text-destructive"
                    )}
                    title={e.error ?? undefined}
                  >
                    {e.ok ? "已開" : "失敗"}
                  </span>
                  {e.error && (
                    <div className="text-xs text-muted-foreground">
                      {e.error}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {e.latency_ms !== null ? `${e.latency_ms} ms` : ""}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {[e.client_address, e.geo_city].filter(Boolean).join(" · ")}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
