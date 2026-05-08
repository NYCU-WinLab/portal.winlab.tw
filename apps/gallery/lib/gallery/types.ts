import type { MediaKind } from "@/lib/gallery/mime"

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
  vote_count: number
  voted_by_me: boolean
  voter_names: string[]
}
