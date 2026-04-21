import Link from "next/link"
import * as React from "react"

type PortalShellProps = {
  appName: string
  appHref?: string
  children: React.ReactNode
  topRight?: React.ReactNode
  bottomLeft?: React.ReactNode
}

export function PortalShell({
  appName,
  appHref = "/",
  children,
  topRight,
  bottomLeft,
}: PortalShellProps) {
  return (
    <>
      <PortalCorner position="top-left">
        <Link
          href={appHref}
          className="transition-colors hover:text-foreground"
        >
          {appName}
        </Link>
      </PortalCorner>
      {topRight ? (
        <PortalCorner position="top-right">{topRight}</PortalCorner>
      ) : null}
      {bottomLeft ? (
        <PortalCorner position="bottom-left">{bottomLeft}</PortalCorner>
      ) : null}
      <PortalCorner position="bottom-right">
        © {new Date().getFullYear()}
      </PortalCorner>
      <main className="mx-auto w-full max-w-2xl px-6 py-20">{children}</main>
    </>
  )
}

const cornerClasses = {
  "top-left": "top-0 left-0",
  "top-right": "top-0 right-0",
  "bottom-left": "bottom-0 left-0",
  "bottom-right": "bottom-0 right-0",
} as const

type Position = keyof typeof cornerClasses

function PortalCorner({
  position,
  children,
}: {
  position: Position
  children: React.ReactNode
}) {
  return (
    <div
      className={`fixed z-50 p-6 text-xs text-muted-foreground ${cornerClasses[position]}`}
    >
      {children}
    </div>
  )
}
