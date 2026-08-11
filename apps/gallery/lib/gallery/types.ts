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
import type { GalleryTag } from "@/lib/gallery/tags"

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
  pinned_at: string | null
  sequence_id: string | null
  sequence_index: number | null
  sequence_count: number
  sequence_items: GallerySequenceItem[]
  sequence_missing_indexes: number[]
  comments: GalleryComment[]
  comment_count: number
  tags: GalleryTag[]
  reaction_counts: ReactionCounts
  my_reaction: GalleryReaction | null
  reaction_names: ReactionNames
  /** True when the signed-in viewer saved this cover (or any sequence sibling). */
  is_favorited?: boolean
}

export type GallerySequenceItem = {
  id: string
  name: string
  image_path: string
  media_type: MediaKind
  poster_path: string | null
  created_at: string
  sequence_index: number | null
  tags: GalleryTag[]
}

export type { GalleryTag }

export type GalleryComment = {
  id: string
  image_id: string
  parent_id: string | null
  body: string
  created_by: string
  created_at: string
  updated_at: string | null
  pinned_at: string | null
  commenter_name: string
  like_count: number
  liked_by_me: boolean
}

export type GalleryMember = {
  id: string
  name: string | null
  email: string | null
}

export { EMPTY_REACTION_COUNTS, EMPTY_REACTION_NAMES }
