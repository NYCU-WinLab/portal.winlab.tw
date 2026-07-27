"use client"

import { useQuery } from "@tanstack/react-query"

import { getRoomAvailabilityRange } from "@/app/rooms/actions"

import { queryKeys } from "./query-keys"

/** `startDate` is a YYYY-MM-DD Asia/Taipei calendar day. */
export function useRoomAvailabilityRange(startDate: string, days: number) {
  return useQuery({
    queryKey: queryKeys.availability.range(startDate, days),
    queryFn: () => getRoomAvailabilityRange(startDate, days),
    staleTime: 60_000,
  })
}
