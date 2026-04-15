import { get, post } from "./client";
import type { AnswerResponse, LessonStartResponse, LessonSummary, Question } from "../types/lesson";

export function startLesson(options: {
  packageId?: number;
  subject?: string;
  questionCount: number;
}) {
  return post<LessonStartResponse>("/lessons/start", {
    package_id: options.packageId,
    subject: options.subject,
    question_count: options.questionCount,
  });
}

export interface SubjectInfo {
  subject: string;
  display: string;
  package_count: number;
}

export function listSubjects() {
  return get<SubjectInfo[]>("/lessons/subjects");
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

export function extendLesson(sessionId: number) {
  return post<{ question: Question; total_questions: number; extension_count: number }>(
    `/lessons/${sessionId}/extend`
  );
}
