export const GALLERY_PWA_INSTALL_DISMISS_KEY = "gallery-pwa-install-dismissed"

export function isIosDevice(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent)
}

export function isStandaloneDisplayMode(
  displayModeMatches: boolean,
  iosStandalone: boolean
): boolean {
  return displayModeMatches || iosStandalone
}
