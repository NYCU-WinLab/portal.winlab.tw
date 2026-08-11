/** Pure gate: Esc should not bubble to close the lightbox while the picker is open. */
export function shouldStopLightboxEscape(pickerOpen: boolean): boolean {
  return pickerOpen
}
