import type { MediaKind } from "@/lib/gallery/mime"
import type {
  GalleryReaction,
  ReactionCounts,
  ReactionNames,
} from "@/lib/gallery/reactions"
import {
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
} from "@/lib/gallery/reactions"

export type GalleryImage = {
  id: string
  name: string
  uploader_name: string
  image_path: string
  media_type: MediaKind
  poster_path: string | null
  duration_seconds: number | null
  created_by: string | null
  created_at: string
  reaction_counts: ReactionCounts
  my_reaction: GalleryReaction | null
  reaction_names: ReactionNames
}

export { EMPTY_REACTION_COUNTS, EMPTY_REACTION_NAMES }
