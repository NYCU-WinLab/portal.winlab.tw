import { createDraft } from "../actions"

export default async function NewDraftPage() {
  await createDraft()
  return null
}
