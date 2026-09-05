export type QuizSessionStatus = "lobby" | "question" | "reveal" | "ended"

export interface QuizSet {
  id: string
  title: string
  created_by: string
  created_at: string
}

export interface QuizQuestion {
  id: string
  quiz_set_id: string
  position: number
  question_text: string
  choices: string[]
  correct_index: number
  time_limit_seconds: number
}

export interface QuizSession {
  id: string
  quiz_set_id: string
  host_id: string
  room_code: string
  status: QuizSessionStatus
  current_question_position: number
  question_started_at: string | null
  created_at: string
  ended_at: string | null
}

export interface QuizPlayer {
  id: string
  session_id: string
  user_id: string
  nickname: string
  score: number
  joined_at: string
}

export interface CurrentQuestion {
  question_id: string
  position: number
  question_count: number
  question_text: string
  choices: string[]
  time_limit_seconds: number
  question_started_at: string
  // Both correct_index and the my_* fields stay null until the host calls
  // reveal_quiz_answer -- see get_current_question in the quiz migration.
  correct_index: number | null
  my_choice_index: number | null
  my_is_correct: boolean | null
  my_points_awarded: number | null
}

// The frozen copy of a session's questions, snapshotted at
// create_quiz_session time. Only readable once the session has ended (see
// quiz_session_questions_select in the history migration) -- unlike
// CurrentQuestion, correct_index here is never hidden, since by the time a
// session is 'ended' every question has already gone through its own
// per-question reveal live.
export interface QuizSessionQuestion {
  id: string
  session_id: string
  position: number
  question_text: string
  choices: string[]
  correct_index: number
  time_limit_seconds: number
}

export interface QuizAnswerRecord {
  id: string
  session_id: string
  question_id: string
  player_id: string
  choice_index: number
  is_correct: boolean
  points_awarded: number
  answered_at: string
}

export interface QuizSessionSummary extends QuizSession {
  quiz_title: string
}
