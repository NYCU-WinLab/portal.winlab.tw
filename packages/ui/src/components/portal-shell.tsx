import Link from "next/link"
import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

type PortalShellProps = {
  appName: string
  appHref?: string
  children: React.ReactNode
  topRight?: React.ReactNode
  bottomLeft?: React.ReactNode
  containerClassName?: string
  cornerClassName?: string
}

export function PortalShell({
  appName,
  appHref = "/",
  children,
  topRight,
  bottomLeft,
  containerClassName,
  cornerClassName,
}: PortalShellProps) {
  return (
    <>
      <PortalCorner position="top-left" className={cornerClassName}>
        <Link
          href={appHref}
          className="transition-colors hover:text-foreground"
        >
          {appName}
        </Link>
      </PortalCorner>
      {topRight ? (
        <PortalCorner position="top-right" className={cornerClassName}>
          {topRight}
        </PortalCorner>
      ) : null}
      {bottomLeft ? (
        <PortalCorner position="bottom-left" className={cornerClassName}>
          {bottomLeft}
        </PortalCorner>
      ) : null}
      <PortalCorner position="bottom-right" className={cornerClassName}>
        © {new Date().getFullYear()}
      </PortalCorner>
      <main
        className={cn(
          "mx-auto w-full max-w-2xl px-6 py-20",
          containerClassName
        )}
      >
        {children}
      </main>
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
  className,
  children,
}: {
  position: Position
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "fixed z-50 p-6 text-xs text-muted-foreground",
        cornerClasses[position],
        className
      )}
    >
      {children}
    </div>
  )
}
