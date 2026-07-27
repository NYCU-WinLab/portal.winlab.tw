"use client"

import { useQuery } from "@tanstack/react-query"

import { getRoomAvailability } from "@/app/meetings/room-availability-actions"

import { queryKeys } from "./query-keys"

/** `date` is a YYYY-MM-DD Asia/Taipei calendar day. */
export function useRoomAvailability(date: string) {
  return useQuery({
    queryKey: queryKeys.roomAvailability.byDate(date),
    queryFn: () => getRoomAvailability(date),
    staleTime: 60_000,
  })
}
