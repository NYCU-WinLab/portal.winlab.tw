"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createRecurringMeeting,
  deleteRecurringMeeting,
  getRecurringMeetings,
  setRecurringActive,
  type CreateRecurringInput,
} from "@/app/rooms/actions"

import { queryKeys } from "./query-keys"

export function useRecurringMeetings() {
  return useQuery({
    queryKey: queryKeys.recurring.all,
    queryFn: () => getRecurringMeetings(),
  })
}

function useRecurringMutation<TArgs>(fn: (args: TArgs) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurring.all })
    },
  })
}

export function useCreateRecurring() {
  return useRecurringMutation((input: CreateRecurringInput) =>
    createRecurringMeeting(input)
  )
}

export function useSetRecurringActive() {
  return useRecurringMutation(
    ({ id, active }: { id: string; active: boolean }) =>
      setRecurringActive(id, active)
  )
}

export function useDeleteRecurring() {
  return useRecurringMutation((id: string) => deleteRecurringMeeting(id))
}
