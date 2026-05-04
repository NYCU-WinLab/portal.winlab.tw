"use client"

import { useMemo } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts"

import type { Transaction } from "@/lib/reimburse/types"

const twd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  minimumFractionDigits: 0,
})

// ISO week key (Monday-anchored) so the chart bins by calendar week.
function weekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  )
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  )
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`
}

function buildChartData(transactions: Transaction[]) {
  const ingress = new Map<string, number>()
  const egress = new Map<string, number>()

  for (const tx of transactions) {
    if (tx.type === "ingress") {
      const key = weekKey(new Date(tx.ingressDate))
      ingress.set(key, (ingress.get(key) ?? 0) + tx.ingressAmount)
    } else {
      const key = weekKey(new Date(tx.invoiceDate))
      const amount = tx.itemAmount + (tx.transferFee ?? 0)
      egress.set(key, (egress.get(key) ?? 0) + amount)
    }
  }

  const weeks = Array.from(new Set([...ingress.keys(), ...egress.keys()]))
  return weeks.sort().map((week) => ({
    week,
    ingress: ingress.get(week) ?? 0,
    egress: egress.get(week) ?? 0,
  }))
}

interface UnifiedChartProps {
  data: Transaction[]
}

export function UnifiedChart({ data }: UnifiedChartProps) {
  const chartData = useMemo(() => buildChartData(data), [data])

  return (
    <div className="h-full w-full rounded-lg border p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            stroke="currentColor"
            strokeOpacity={0.1}
            vertical={false}
          />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            strokeOpacity={0.4}
          />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--popover-foreground)",
              fontSize: 12,
            }}
            formatter={(value, name) => [
              twd.format(Number(value)),
              name === "ingress" ? "收入" : "支出",
            ]}
          />
          <Line
            type="monotone"
            dataKey="ingress"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="egress"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
