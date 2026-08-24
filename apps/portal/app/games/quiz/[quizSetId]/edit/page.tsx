import { EditQuizSet } from "./_components/edit-quiz-set"

export default async function EditQuizSetPage({
  params,
}: {
  params: Promise<{ quizSetId: string }>
}) {
  const { quizSetId } = await params
  return <EditQuizSet quizSetId={quizSetId} />
}
