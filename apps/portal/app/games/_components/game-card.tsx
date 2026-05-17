"use client"

import Link from "next/link"

import type { GameMeta } from "@/lib/games/types"

interface GameCardProps {
  meta: GameMeta
}

export function GameCard({ meta }: GameCardProps) {
  return (
    <Link
      href={`/games/${meta.slug}`}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-6 transition-all hover:border-foreground/20 hover:shadow-md"
    >
      <span className="text-4xl">{meta.icon}</span>
      <div>
        <h2 className="text-lg font-semibold group-hover:text-foreground">
          {meta.title}
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {meta.description}
        </p>
      </div>
      <span className="mt-auto text-xs text-muted-foreground transition-colors group-hover:text-foreground">
        開始遊戲 →
      </span>
    </Link>
  )
}
