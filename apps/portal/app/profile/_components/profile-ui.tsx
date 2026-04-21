import * as React from "react"

export function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card text-sm">
        {children}
      </div>
    </section>
  )
}

export function FieldRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  const isEmpty =
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && value.trim() === "")

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span
        className={
          "max-w-[70%] min-w-0 text-right text-xs break-all " +
          (mono ? "font-mono " : "") +
          (isEmpty ? "text-muted-foreground/60 italic" : "")
        }
      >
        {isEmpty ? "—" : value}
      </span>
    </div>
  )
}

export function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

export function maskToken(token: string | null | undefined): string {
  if (!token) return ""
  if (token.length <= 16) return "•".repeat(token.length)
  return `${token.slice(0, 8)}…${token.slice(-4)}`
}

export function formatUnixSeconds(seconds: number | undefined): string {
  if (!seconds) return ""
  const date = new Date(seconds * 1000)
  const now = Date.now()
  const diffMs = date.getTime() - now
  const mins = Math.round(diffMs / 60_000)
  const rel = mins >= 0 ? `in ${mins} min` : `${Math.abs(mins)} min ago`
  return `${date.toISOString()} (${rel})`
}
