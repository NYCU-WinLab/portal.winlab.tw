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
