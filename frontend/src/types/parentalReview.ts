export interface ParentalReview {
  id: number;
  parent_id: number;
  child_id: number;
  package_id: number | null;
  subject_id: number | null;
  grade: number | null;
  target_credits: number;
  current_credits: number;
  status: "active" | "completed" | "cancelled";
  note: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface NextBatchResponse {
  session_id: number;
  question: import("./lesson").Question;
  review_progress: number;
  review_target: number;
  review_status: string;
}

export interface ParentalReviewCreate {
  child_id: number;
  package_id?: number;
  subject_id?: number;
  grade?: number | null;
  target_credits?: number;
  note?: string | null;
}
