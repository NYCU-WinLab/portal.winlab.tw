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
  sequence_id: string | null
  sequence_index: number | null
  sequence_count: number
  sequence_items: GallerySequenceItem[]
  comments: GalleryComment[]
  reaction_counts: ReactionCounts
  my_reaction: GalleryReaction | null
  reaction_names: ReactionNames
}

export type GallerySequenceItem = {
  id: string
  name: string
  image_path: string
  media_type: MediaKind
  poster_path: string | null
  created_at: string
}

export type GalleryComment = {
  id: string
  image_id: string
  parent_id: string | null
  body: string
  created_by: string
  created_at: string
  commenter_name: string
}

export type GalleryMember = {
  id: string
  name: string | null
  email: string | null
}

export { EMPTY_REACTION_COUNTS, EMPTY_REACTION_NAMES }
