// The presenter-name fallback applied on save, extracted from
// meeting-edit-dialog.tsx's handleSave. This is the data-loss fix from commit
// 69cbe3f, pulled out because it is pure logic wearing a React component as a
// costume — no fetch, no state, nothing that needs a browser to exercise.
//
// `users` (useLabUsers()'s now lab-status-filtered roster) can omit the
// meeting's stored presenter entirely — graduated, unmapped in Keycloak,
// etc. Looking the selection up in that list and falling back OUT of it on a
// miss would misreport a real presenter as unassigned. So: if the id being
// saved is the SAME one the meeting already carries and the lookup misses
// (filtered out), keep the meeting's stored name instead of nulling it. An
// admin who deliberately changes the presenter still gets the new value; an
// admin who touches nothing keeps what was there.

/**
 * Resolve the `presenter` display name to write for a presentation/thesis
 * week, given the roster lookup's result for the id being saved.
 *
 * `selectedName` is `users.find(...)?.name` — `undefined` when the id isn't
 * in the (filtered) roster at all, `null` when it is but carries no name.
 * Both count as "the lookup didn't produce a name" and fall through to the
 * staleness check, matching the original `selectedUser?.name ?? …` ternary.
 */
export function resolvePresenterNameOnSave(input: {
  presenterUserId: string
  selectedName: string | null | undefined
  meetingPresenterUserId: string | null
  meetingPresenter: string | null
}): string | null {
  return (
    input.selectedName ??
    (input.presenterUserId === input.meetingPresenterUserId
      ? input.meetingPresenter
      : null)
  )
}
