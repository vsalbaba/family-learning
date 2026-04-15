import type { ActivityType } from "./package";

export interface Question {
  item_id: number;
  question_index: number;
  total_questions: number;
  activity_type: ActivityType;
  question: string;
  answer_data: string;
  hint: string | null;
  tts_lang: string | null;
}

export interface AnswerResponse {
  is_correct: boolean;
  correct_answer: string;
  given_answer: string;
  explanation: string | null;
  next_question: Question | null;
}

export interface LessonStartResponse {
  session_id: number;
  total_questions: number;
  question: Question;
}

export interface AnswerDetail {
  item_id: number;
  question: string;
  activity_type: string;
  given_answer: string;
  correct_answer: string;
  is_correct: boolean;
  response_time_ms: number | null;
}

export interface LessonSummary {
  session_id: number;
  total_questions: number;
  correct_count: number;
  score_percent: number;
  started_at: string;
  finished_at: string | null;
  answers: AnswerDetail[];
}
