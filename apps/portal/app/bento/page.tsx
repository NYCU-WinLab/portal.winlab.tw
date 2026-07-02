import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query"

import { queryKeys } from "@/hooks/bento/query-keys"
import { fetchOrders } from "@/lib/bento/fetch"
import { createClient } from "@/lib/supabase/server"

import { OrderList } from "./_components/order-list"

export default async function BentoHome() {
  const queryClient = new QueryClient()
  const supabase = await createClient()

  await queryClient.prefetchQuery({
    queryKey: queryKeys.orders.list(),
    queryFn: () => fetchOrders(supabase),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OrderList />
    </HydrationBoundary>
  )
}
