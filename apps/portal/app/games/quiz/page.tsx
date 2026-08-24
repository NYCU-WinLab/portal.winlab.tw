"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { useAuth } from "@/hooks/use-auth"
import { useQuizSets } from "@/hooks/games/use-quiz-sets"
import {
  useCreateQuizSession,
  useJoinQuizSession,
} from "@/hooks/games/use-quiz-session"

import { QuizSetCard } from "./_components/quiz-set-card"

export default function QuizLobbyPage() {
  const { user } = useAuth()
  const { data: quizSets, isLoading } = useQuizSets()
  const createSession = useCreateQuizSession()
  const joinSession = useJoinQuizSession()
  const [roomCode, setRoomCode] = useState("")

  const handleJoin = () => {
    if (!roomCode.trim()) return
    joinSession.mutate(roomCode.trim(), {
      onError: (err) => toast.error(err.message),
    })
  }

  const handleHost = (quizSetId: string) => {
    createSession.mutate(quizSetId, {
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-3">
        <Link
          href="/games"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← 遊戲大廳
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">🧠 即時問答</span>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">即時問答</h1>
        <p className="text-sm text-muted-foreground">
          自建版 Kahoot — 建立題庫、開房間主持，或輸入房間碼加入遊戲。
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-6 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="room-code" className="text-sm font-medium">
            房間碼
          </label>
          <Input
            id="room-code"
            placeholder="例如 K7X2QM"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            maxLength={6}
            className="uppercase"
          />
        </div>
        <Button
          onClick={handleJoin}
          disabled={joinSession.isPending || !roomCode.trim()}
        >
          {joinSession.isPending ? "加入中…" : "加入遊戲"}
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">題庫</h2>
          <Button asChild size="sm">
            <Link href="/games/quiz/new">建立新題庫</Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : !quizSets?.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            還沒有任何題庫，建立一個開始吧！
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {quizSets.map((quizSet) => (
              <QuizSetCard
                key={quizSet.id}
                quizSet={quizSet}
                isOwner={quizSet.created_by === user?.id}
                onHost={() => handleHost(quizSet.id)}
                hosting={
                  createSession.isPending &&
                  createSession.variables === quizSet.id
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
