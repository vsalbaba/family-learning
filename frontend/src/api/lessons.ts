import { get, post } from "./client";
import type { AnswerResponse, LessonStartResponse, LessonSummary } from "../types/lesson";

export function startLesson(packageId: number, questionCount: number) {
  return post<LessonStartResponse>("/lessons/start", {
    package_id: packageId,
    question_count: questionCount,
  });
}

export function submitAnswer(
  sessionId: number,
  itemId: number,
  givenAnswer: unknown,
  responseTimeMs?: number
) {
  return post<AnswerResponse>(`/lessons/${sessionId}/answer`, {
    item_id: itemId,
    given_answer: JSON.stringify(givenAnswer),
    response_time_ms: responseTimeMs,
  });
}

export function getLessonSummary(sessionId: number) {
  return get<LessonSummary>(`/lessons/${sessionId}/summary`);
}
