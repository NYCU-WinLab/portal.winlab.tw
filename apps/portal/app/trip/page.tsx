import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query"

import { queryKeys } from "@/hooks/trip/query-keys"
import { fetchTrips } from "@/lib/trip/fetch"
import { createClient } from "@/lib/supabase/server"

import { TripList } from "./_components/trip-list"

export default async function TripHome() {
  const queryClient = new QueryClient()
  const supabase = await createClient()

  await queryClient.prefetchQuery({
    queryKey: queryKeys.trips.list(),
    queryFn: () => fetchTrips(supabase),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TripList />
    </HydrationBoundary>
  )
}
