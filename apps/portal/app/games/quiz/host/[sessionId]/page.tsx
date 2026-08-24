import { QuizHost } from "../../_components/quiz-host"

export default async function QuizHostPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  return <QuizHost sessionId={sessionId} />
}
