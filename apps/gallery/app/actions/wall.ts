"use server"

import { parseGalleryHomeFilters } from "@/lib/gallery/home-filters"
import { loadGalleryHomePage } from "@/lib/gallery/load-home-page"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"
import type { GalleryImage } from "@/lib/gallery/types"

export type GalleryWallFiltersInput = {
  uploader?: string
  media?: string
  after?: string
  q?: string
}

export async function fetchGalleryWallPage(
  page: number,
  filtersInput: GalleryWallFiltersInput
): Promise<
  | { ok: true; images: GalleryImage[]; page: number; hasMore: boolean }
  | { ok: false; error: string }
> {
  const currentPage = Number.isFinite(page) && page > 0 ? page : 1
  const supabase = await createClient()
  const user = await getCurrentUser()
  const filters = parseGalleryHomeFilters(filtersInput)

  const result = await loadGalleryHomePage(supabase, {
    page: currentPage,
    userId: user?.id ?? null,
    filters,
  })

  return {
    ok: true,
    images: result.images,
    page: result.currentPage,
    hasMore: result.currentPage < result.totalPages,
  }
}
