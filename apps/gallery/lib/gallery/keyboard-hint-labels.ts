/** Desktop lightbox corner hint (non-sequence). */
export function describeLightboxHintLabel(): string {
  return "← → navigate · R react · S share · ? keys"
}

/** Manage Select mode chip hint under the toolbar. */
export function describeManageSelectHintLabel(): string {
  return "J/K move focus · Space toggles · Shift+click ranges · A selects visible"
}

/** Whether an external openSignal should open the reaction picker. */
export function shouldOpenReactionFromSignal(
  previous: number,
  next: number
): boolean {
  return next > 0 && next !== previous
}
