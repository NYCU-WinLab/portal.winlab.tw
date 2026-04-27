"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { Trip, TripStatus } from "@/lib/trip/types"

import { queryKeys } from "./query-keys"

export function useTrips() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.trips.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .order("status", { ascending: true }) // open first
        .order("created_at", { ascending: false })

      if (error) throw error
      return (data ?? []) as Trip[]
    },
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
    mutationFn: async (params: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from("trips")
        .insert({
          name: params.name,
          description: params.description ?? null,
        })
        .select()
        .single()
      if (error) throw error
      return data as Trip
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.trips.all })
    },
  })
}

export function useSetTripStatus() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { id: string; status: TripStatus }) => {
      const { data, error } = await supabase
        .from("trips")
        .update({
          status: params.status,
          closed_at:
            params.status === "closed" ? new Date().toISOString() : null,
        })
        .eq("id", params.id)
        .select()
        .single()
      if (error) throw error
      return data as Trip
    },
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
