import { Badge } from "@workspace/ui/components/badge"

import type { Tag, TagVariant } from "@/lib/receipts/types"

const TAG_VARIANT_LABEL: Record<TagVariant, string> = {
  default: "強調",
  secondary: "一般",
  outline: "弱化",
}

export function TagBadge({ tag }: { tag: Tag }) {
  return <Badge variant={tag.variant}>{tag.name}</Badge>
}

export { TAG_VARIANT_LABEL }
