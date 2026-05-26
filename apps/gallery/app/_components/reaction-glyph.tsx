import { cn } from "@workspace/ui/lib/utils"

import {
  REACTION_EMOJI,
  type GalleryReaction,
} from "@/lib/gallery/reactions"

export function ReactionGlyph({
  reaction,
  className,
}: {
  reaction: GalleryReaction
  className?: string
}) {
  if (reaction === "point") {
    return (
      <span
        className={cn(
          "inline-flex flex-row items-center gap-px leading-none whitespace-nowrap select-none [-webkit-touch-callout:none]",
          className
        )}
        aria-hidden
      >
        <span className="inline-block select-none">👉</span>
        <span className="inline-block select-none">👈</span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-block leading-none select-none [-webkit-touch-callout:none]",
        className
      )}
      aria-hidden
    >
      {REACTION_EMOJI[reaction]}
    </span>
  )
}
