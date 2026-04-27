import { TripDetail } from "../_components/trip-detail"

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <TripDetail tripId={id} />
}
