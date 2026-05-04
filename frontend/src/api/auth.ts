import { get, post, put } from "./client";
import type { LoginResponse, User } from "../types/user";

export function getSetupStatus() {
  return get<{ parent_exists: boolean }>("/auth/setup-status");
}

export function setup(name: string, pin: string, appPin: string) {
  return post<User>("/auth/setup", { name, pin, app_pin: appPin });
}

export function login(name: string, pin: string) {
  return post<LoginResponse>("/auth/login", { name, pin });
}

export function getMe() {
  return get<User>("/auth/me");
}

export function createChild(name: string, pin: string, avatar?: string, grade?: number) {
  return post<User>("/children", { name, pin, avatar, grade });
}

export function listChildren() {
  return get<User[]>("/children");
}

export function updateChild(childId: number, data: { name?: string; pin?: string; game_tokens?: number; grade?: number | null }) {
  return put<User>(`/children/${childId}`, data);
}

export interface PackageProgress {
  package_id: number;
  package_name: string;
  subject: string | null;
  session_count: number;
  avg_score_pct: number;
  best_score_pct: number;
  last_played: string | null;
}

export interface WeakQuestion {
  item_id: number;
  question: string;
  activity_type: string;
  correct_answer: string;
  package_name: string;
  wrong_count: number;
  total_attempts: number;
  error_rate_pct: number;
  wrong_answers: string[];
}

export interface SubjectProgress {
  subject_id: number;
  subject_slug: string;
  subject: string;
  session_count: number;
  avg_score_pct: number;
  best_score_pct: number;
  last_played: string | null;
}

export interface ChildProgress {
  child_id: number;
  child_name: string;
  total_sessions: number;
  total_correct: number;
  total_questions: number;
  overall_avg_pct: number;
  packages: PackageProgress[];
  subject_progress: SubjectProgress[];
  weak_questions: WeakQuestion[];
}

export function getChildProgress(childId: number) {
  return get<ChildProgress>(`/children/${childId}/progress`);
}

export interface ProgressDetailItem {
  item_id: number;
  package_id: number;
  package_name: string;
  question: string;
  activity_type: string;
  answer_count: number;
  correct_count: number;
  wrong_count: number;
  mastery: "unknown" | "learning" | "known" | "review";
  last_answered_at: string | null;
}

export interface ProgressDetailWrongAnswer {
  item_id: number;
  package_id: number;
  package_name: string;
  question: string;
  activity_type: string;
  correct_answer_data: unknown;
  given_answer_data: unknown;
  answered_at: string;
}

export interface ProgressDetail {
  scope_type: "package" | "subject";
  package_id: number | null;
  subject: string | null;
  title: string;
  total_answers: number;
  mastery_counts: { unknown: number; learning: number; known: number; review: number };
  items: ProgressDetailItem[];
  recent_wrong: ProgressDetailWrongAnswer[];
}

export function getPackageDetail(childId: number, packageId: number) {
  return get<ProgressDetail>(`/children/${childId}/progress/package/${packageId}`);
}

export function getSubjectDetail(childId: number, subjectSlug: string) {
  return get<ProgressDetail>(`/children/${childId}/progress/subject/${encodeURIComponent(subjectSlug)}`);
}

export interface SubjectActivity {
  subject_id: number;
  subject_slug: string;
  subject_name: string;
  task_count: number;
}

export interface DailyActivity {
  child_id: number;
  date: string;
  total_tasks: number;
  subjects: SubjectActivity[];
}

export interface PackageActivity {
  package_id: number;
  package_name: string;
  task_count: number;
  correct_count: number;
  wrong_count: number;
}

export interface SubjectDailyDetail {
  child_id: number;
  date: string;
  subject_id: number;
  subject_slug: string;
  subject_name: string;
  total_tasks: number;
  packages: PackageActivity[];
}

export function getDailyActivity(
  childId: number,
  opts?: { date?: string; fromDate?: string; toDate?: string },
) {
  const params = new URLSearchParams();
  if (opts?.fromDate) params.set("from_date", opts.fromDate);
  if (opts?.toDate) params.set("to_date", opts.toDate);
  if (opts?.date) params.set("date", opts.date);
  const qs = params.toString();
  return get<DailyActivity>(`/children/${childId}/activity/daily${qs ? `?${qs}` : ""}`);
}

export function getSubjectDailyDetail(
  childId: number,
  subjectSlug: string,
  opts?: { date?: string; fromDate?: string; toDate?: string },
) {
  const params = new URLSearchParams();
  if (opts?.fromDate) params.set("from_date", opts.fromDate);
  if (opts?.toDate) params.set("to_date", opts.toDate);
  if (opts?.date) params.set("date", opts.date);
  const qs = params.toString();
  return get<SubjectDailyDetail>(`/children/${childId}/activity/daily/subjects/${encodeURIComponent(subjectSlug)}${qs ? `?${qs}` : ""}`);
}
