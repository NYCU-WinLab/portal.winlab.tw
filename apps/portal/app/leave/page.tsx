import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query"

import { queryKeys } from "@/hooks/leave/query-keys"
import { fetchLeaves } from "@/lib/leave/fetch"
import { createClient } from "@/lib/supabase/server"

import { LeaveList } from "./_components/leave-list"

export default async function LeaveHome() {
  const queryClient = new QueryClient()
  const supabase = await createClient()

  // Prefetch on the server with the same queryKey the client hook uses, then
  // hand the dehydrated cache to the client. LeaveList hydrates with real rows
  // from the HTML — no post-hydration client fetch round-trip on first load.
  await queryClient.prefetchQuery({
    queryKey: queryKeys.leaves.list(),
    queryFn: () => fetchLeaves(supabase),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <LeaveList />
    </HydrationBoundary>
  )
}
