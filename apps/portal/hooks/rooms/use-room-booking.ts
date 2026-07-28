"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  cancelBooking,
  confirmBooking,
  getPortalBookingsForDate,
  type ConfirmBookingInput,
} from "@/app/rooms/actions"

import { queryKeys } from "./query-keys"

/** Bookings Portal itself made on a given date, for matching against the grid. */
export function usePortalBookingsForDate(date: string) {
  return useQuery({
    queryKey: queryKeys.portalBookings.byDate(date),
    queryFn: () => getPortalBookingsForDate(date),
    staleTime: 30_000,
  })
}

export function useConfirmBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ConfirmBookingInput) => confirmBooking(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] })
    },
  })
}

export function useCancelBooking() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] })
    },
  })
}
