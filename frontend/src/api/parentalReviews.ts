import { get, post, patch } from "./client";
import type { ParentalReview, NextBatchResponse, ParentalReviewCreate } from "../types/parentalReview";

export function createParentalReview(data: ParentalReviewCreate) {
  return post<ParentalReview>("/parental-reviews", data);
}

export function listParentalReviews() {
  return get<ParentalReview[]>("/parental-reviews");
}

export function getParentalReview(reviewId: number) {
  return get<ParentalReview>(`/parental-reviews/${reviewId}`);
}

export function cancelParentalReview(reviewId: number) {
  return patch<ParentalReview>(`/parental-reviews/${reviewId}/cancel`);
}

export function getNextBatch(reviewId: number, questionCount?: number) {
  return post<NextBatchResponse>(
    `/parental-reviews/${reviewId}/next-batch`,
    questionCount !== undefined ? { question_count: questionCount } : {}
  );
}

export function listChildReviews(childId: number) {
  return get<ParentalReview[]>(`/parental-reviews/child/${childId}`);
}
