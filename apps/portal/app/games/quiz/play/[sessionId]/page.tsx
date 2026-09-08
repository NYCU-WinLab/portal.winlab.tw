import { QuizPlay } from "../../_components/quiz-play"

export default async function QuizPlayPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  return <QuizPlay sessionId={sessionId} />
}
