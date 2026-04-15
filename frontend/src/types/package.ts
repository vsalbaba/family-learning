export type ActivityType =
  | "flashcard"
  | "multiple_choice"
  | "true_false"
  | "fill_in"
  | "matching"
  | "ordering"
  | "math_input";

export interface PackageSummary {
  id: number;
  name: string;
  subject: string | null;
  difficulty: string | null;
  description: string | null;
  status: "draft" | "ready" | "published" | "archived";
  version: number;
  validation_warnings: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  tts_lang: string | null;
  item_count: number;
}

export interface PackageItem {
  id: number;
  sort_order: number;
  activity_type: ActivityType;
  question: string;
  answer_data: string;
  hint: string | null;
  explanation: string | null;
  tags: string | null;
}

export interface PackageDetail extends PackageSummary {
  items: PackageItem[];
}

export interface ValidationError {
  code: string;
  message: string;
  path: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  is_valid: boolean;
  hard_errors: ValidationError[];
  soft_warnings: ValidationError[];
}

export interface ImportResponse {
  package: PackageSummary | null;
  validation: ValidationResult;
}
