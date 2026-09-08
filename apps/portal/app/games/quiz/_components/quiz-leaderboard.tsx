import type { QuizPlayer } from "@/lib/games/quiz/types"

interface QuizLeaderboardProps {
  players: QuizPlayer[]
  highlightUserId?: string
}

export function QuizLeaderboard({
  players,
  highlightUserId,
}: QuizLeaderboardProps) {
  if (!players.length) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        還沒有玩家
      </p>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-1">
      {players.map((player, i) => (
        <div
          key={player.id}
          className={
            "grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 rounded-md px-3 py-2 text-sm" +
            (player.user_id === highlightUserId
              ? " border border-primary/40 bg-primary/5"
              : "")
          }
        >
          <span
            className={
              i === 0
                ? "font-bold text-yellow-500"
                : i === 1
                  ? "font-semibold text-zinc-400"
                  : i === 2
                    ? "font-semibold text-amber-600"
                    : "text-muted-foreground"
            }
          >
            {i + 1}
          </span>
          <span className="truncate font-medium">{player.nickname}</span>
          <span className="text-right tabular-nums">{player.score}</span>
        </div>
      ))}
    </div>
  )
}
