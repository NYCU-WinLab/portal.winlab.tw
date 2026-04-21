import { OrderDetail } from "../../_components/order-detail"

export default async function BentoOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <OrderDetail orderId={id} />
}
