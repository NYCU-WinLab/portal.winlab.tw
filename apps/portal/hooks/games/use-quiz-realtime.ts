"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

// Session-scoped, unlike hooks/bento/use-realtime.ts (mounted once for the
// whole app) -- each quiz session gets its own channel, torn down when the
// host/player leaves that page.
export function useQuizRealtime(sessionId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`quiz-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "quiz_sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.quiz.session(sessionId),
          })
          queryClient.invalidateQueries({
            queryKey: queryKeys.quiz.currentQuestion(sessionId),
          })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "quiz_players",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          toast.info("有玩家加入了", {
            description: `${payload.new.nickname} 加入了遊戲`,
          })
          queryClient.invalidateQueries({
            queryKey: queryKeys.quiz.players(sessionId),
          })
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "quiz_players",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.quiz.players(sessionId),
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, queryClient])
}
