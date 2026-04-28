import {
  formatBytes,
  formatDelay,
  leaveFlavor,
  pickReferenceProduct,
  type ProfileStats,
  spendInReference,
} from "@/lib/profile/stats"

import { FieldRow, Section } from "./profile-ui"

// Server Component on purpose: random product picks once per request, no
// hydration mismatch, no client JS shipped for this.
export function ProfileStatsView({ stats }: { stats: ProfileStats }) {
  const product = pickReferenceProduct()

  const { bento, leave, approve, trip } = stats
  const top = bento.top_item
  const variety =
    bento.total_orders > 0
      ? Math.round((bento.unique_items / bento.total_orders) * 100)
      : 0

  return (
    <div className="flex flex-col gap-10">
      <Section title="便當帳本" description="點過幾次、花了多少、最愛吃什麼。">
        <FieldRow label="訂便當總次數" value={`${bento.total_orders} 次`} />
        <FieldRow
          label="便當總開銷"
          value={
            bento.total_spent === 0
              ? "—"
              : `NT$ ${bento.total_spent}（≈ ${spendInReference(
                  bento.total_spent,
                  product
                )} ${product.unit}${product.emoji} ${product.name}）`
          }
        />
        <FieldRow
          label="本命便當"
          value={
            top
              ? `${top.restaurant_name} ${top.name} × ${top.count}`
              : "還沒有最愛"
          }
        />
        <FieldRow
          label="嚐鮮指數"
          value={
            bento.total_orders === 0
              ? "—"
              : `${variety}%（試過 ${bento.unique_items} 種品項）`
          }
        />
      </Section>

      <Section title="請假記錄" description="還沒被點名前的小確幸。">
        <FieldRow label="請假總天數" value={leaveFlavor(leave.total_days)} />
        <FieldRow
          label="首次請假"
          value={leave.first_date ?? "—"}
          mono={!!leave.first_date}
        />
      </Section>

      <Section title="簽核戰績" description="文件流轉裡的你。">
        <FieldRow label="發起過幾份" value={`${approve.created_count} 份`} />
        <FieldRow label="簽過幾份" value={`${approve.signed_count} 份`} />
        <FieldRow
          label="平均拖延"
          value={formatDelay(approve.avg_sign_delay_seconds)}
        />
      </Section>

      <Section title="出差紀錄" description="跑了多少趟、報帳幾個檔。">
        <FieldRow label="跑過幾趟" value={`${trip.trips_joined} 趟`} />
        <FieldRow label="上傳檔案數" value={`${trip.files_uploaded} 個`} />
        <FieldRow
          label="總憑證容量"
          value={
            trip.total_size_bytes > 0 ? formatBytes(trip.total_size_bytes) : "—"
          }
        />
      </Section>
    </div>
  )
}
