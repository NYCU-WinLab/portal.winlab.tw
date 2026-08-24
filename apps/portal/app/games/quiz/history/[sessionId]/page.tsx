import { QuizHistoryDetail } from "../../_components/quiz-history-detail"

export default async function QuizHistoryDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  return <QuizHistoryDetail sessionId={sessionId} />
}
