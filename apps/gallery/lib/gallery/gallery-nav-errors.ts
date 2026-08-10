/** Soft-fail messages when Next.js navigation throws after a successful action. */
export const galleryNavErrors = {
  closePhoto: "Could not close the photo.",
  openPhoto: "Could not open that photo.",
  openNextPhoto: "Could not open the next photo.",
  clearFilters: "Could not clear gallery filters.",
  openNewAlbum: "Could not open the new album.",
  openRenamedAlbum: "Could not open the renamed album.",
  openAlbumsList: "Could not open the albums list.",
  openWallHome: "Could not open the wall home.",
  openMentionedPhoto: "Could not open the mentioned photo.",
  openWallPhoto: "Could not open the wall photo.",
  openManage: "Could not open Manage.",
  applyUploaderFilter: "Could not apply uploader filter.",
  openTagFilter: "Could not open the tag filter.",
  updateGalleryFilters: "Could not update gallery filters.",
  updateAlbumSearch: "Could not update album search.",
  signedOutHome: "Signed out, but could not open the home page.",
  refreshGalleryChrome: "Theme saved, but the page could not refresh.",
  memoriesPreviousDay: "Could not open the previous Memories day.",
  memoriesNextDay: "Could not open the next Memories day.",
} as const

export type GalleryNavErrorKey = keyof typeof galleryNavErrors

export function describeGalleryNavError(key: GalleryNavErrorKey): string {
  return galleryNavErrors[key]
}
