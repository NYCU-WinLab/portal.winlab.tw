"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchTrips } from "@/lib/trip/fetch"
import { createTrip, setTripStatus, updateTrip } from "@/lib/trip/mutate"
import { createClient } from "@/lib/supabase/client"
import type { Trip, TripStatus } from "@/lib/trip/types"

import { queryKeys } from "./query-keys"

export function useTrips() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.trips.list(),
    queryFn: () => fetchTrips(supabase),
  })
}

export function useTrip(id: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.trips.detail(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("id", id!)
        .single()
      if (error) throw error
      return data as Trip
    },
    enabled: !!id,
  })
}

export function useCreateTrip() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { name: string; description?: string }) =>
      createTrip(supabase, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all })
    },
  })
}

export function useUpdateTrip() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: {
      id: string
      name: string
      description?: string | null
    }) => updateTrip(supabase, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all })
    },
  })
}

export function useSetTripStatus() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { id: string; status: TripStatus }) =>
      setTripStatus(supabase, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all })
    },
  })
}

export function useDeleteTrip() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trips").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all })
    },
  })
}
